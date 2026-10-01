const prisma = require('./prisma');
const { evaluate } = require('./opa');
const { evaluateAndStore, loadEvaluationContext } = require('./assurance');
const { inspectEvent, recordFindings, noteVolume, BLOCKING_KINDS } = require('./threats');
const { assessSafety, SAFETY_BLOCKING } = require('./safety');
const { inspectIp, IP_BLOCKING } = require('./ip');
const { assessOps } = require('./ops');
const { redactFields } = require('./dlp');
const { publish } = require('./stream');

function controlView(decisions) {
  return (decisions || []).map((decision) => ({
    control_id: decision.control_id,
    state: decision.state,
    message: decision.evidence?.message || decision.state,
  }));
}

async function saveDecision(agentId, fields) {
  const row = await prisma.actionDecision.create({
    data: {
      agentId,
      operation: fields.operation || null,
      resource: fields.resource || null,
      tool: fields.tool || null,
      decision: fields.decision,
      reason: fields.reason,
      controls: fields.controls || [],
    },
  });
  publish({ type: 'decision', agentId, decision: fields.decision });
  return {
    id: row.id,
    agent_id: agentId,
    decision: row.decision,
    reason: row.reason,
    operation: row.operation,
    resource: row.resource,
    tool: row.tool,
    controls: row.controls,
    createdAt: row.createdAt,
  };
}

async function decide(agentId, request) {
  const context = await loadEvaluationContext(agentId);
  if (!context) {
    const error = new Error('Agent is not in Attest. Sync it before the call.');
    error.status = 404;
    error.decision = 'block';
    throw error;
  }

  const operation = request.operation || '';
  const resource = request.resource || '';
  const tool = request.tool || '';
  const prompt = request.prompt || '';

  if (context.agent.status === 'Quarantined') {
    return saveDecision(agentId, {
      operation,
      resource,
      tool,
      decision: 'block',
      reason: 'Agent is quarantined. The call is blocked before it runs.',
      controls: [],
    });
  }

  const decisions = await evaluate({
    event: { operation, resource, blocked: false },
    capability: context.capability,
    controls: context.controls,
  });
  const guardInput = {
    prompt,
    tool,
    tool_input: request.tool_input,
    output: request.output,
    flags: request.flags || request.output_flags,
    operation,
    resource,
    sources: request.sources,
    context: request.context,
    documents: request.documents,
    groundedness: request.groundedness,
    hallucination_score: request.hallucination_score,
    safety_scores: request.safety_scores,
    bias_score: request.bias_score,
    bias_attribute: request.bias_attribute,
    workflow: request.workflow,
    domain: request.domain,
    reference: request.reference,
    copyright_score: request.copyright_score,
    trademarks: request.trademarks,
    model: request.model,
    ttft_ms: request.ttft_ms,
    latency_ms: request.latency_ms,
    scan_ms: request.scan_ms,
    eval_score: request.eval_score,
    primary_model: request.primary_model,
    routed_to: request.routed_to,
    fallback_model: request.fallback_model,
    provider_error: request.provider_error,
  };
  const threats = inspectEvent({
    prompt,
    tool,
    toolInput: request.tool_input,
    output: request.output,
    flags: request.flags || request.output_flags,
    operation,
    resource,
    capability: context.capability,
  });
  const safety = assessSafety(guardInput);
  const ipFindings = inspectIp(guardInput);
  const ops = assessOps(guardInput);
  const extra = [...safety.findings, ...ipFindings, ...ops.findings];
  const violating = decisions.filter((decision) => decision.state === 'VIOLATED' || decision.state === 'BLOCKED_VIOLATION');
  const blocking = [
    ...threats.filter((finding) => BLOCKING_KINDS.has(finding.kind)),
    ...extra.filter((finding) => SAFETY_BLOCKING.has(finding.kind) || IP_BLOCKING.has(finding.kind)),
  ];
  const block = violating.length > 0 || blocking.length > 0;

  if (block) {
    await evaluateAndStore(agentId, {
      operation,
      resource,
      blocked: true,
      event_type: 'GATE',
    });
  }

  if (threats.length || extra.length) {
    const event = await prisma.runtimeEvent.create({
      data: {
        agentId,
        eventType: 'GATE',
        operation: operation || null,
        resource: resource || null,
        timestamp: new Date(),
        rawPayload: {
          ...redactFields({
            prompt: prompt || null,
            tool: tool || null,
            tool_input: request.tool_input || null,
            output: request.output || null,
            resource: resource || null,
          }).fields,
          flags: request.flags || request.output_flags || null,
          tokens: request.tokens ?? request.token_count ?? null,
          gate: true,
          guardrails: { ...safety.metrics, ...ops.metrics },
        },
      },
    });
    await recordFindings(event.id, agentId, [...threats, ...extra]);
    await noteVolume(agentId, event.id);
  }

  const controlReason = violating.map((decision) => `${decision.control_id} would be ${decision.state.toLowerCase()}: ${decision.evidence?.message || decision.state}`).join(' ');
  const reason = [blocking.map((finding) => finding.summary).join(' '), controlReason].filter(Boolean).join(' ')
    || 'Controls hold for this call.';

  return saveDecision(agentId, {
    operation,
    resource,
    tool,
    decision: block ? 'block' : 'allow',
    reason,
    controls: controlView(decisions),
  });
}

module.exports = { decide };
