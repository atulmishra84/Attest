const prisma = require('./prisma');
const { evaluate } = require('./opa');
const { evaluateAndStore, loadEvaluationContext } = require('./assurance');
const { inspectEvent, recordFindings } = require('./threats');
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
  const threats = inspectEvent({
    prompt,
    tool,
    toolInput: request.tool_input,
    operation,
    resource,
    capability: context.capability,
  });
  const violating = decisions.filter((decision) => decision.state === 'VIOLATED' || decision.state === 'BLOCKED_VIOLATION');
  const injection = threats.some((finding) => finding.kind === 'PROMPT_INJECTION');
  const block = violating.length > 0 || injection;

  if (block) {
    await evaluateAndStore(agentId, {
      operation,
      resource,
      blocked: true,
      event_type: 'GATE',
    });
  }

  if (threats.length) {
    const event = await prisma.runtimeEvent.create({
      data: {
        agentId,
        eventType: 'GATE',
        operation: operation || null,
        resource: resource || null,
        timestamp: new Date(),
        rawPayload: { prompt: prompt || null, tool: tool || null, tool_input: request.tool_input || null, gate: true },
      },
    });
    await recordFindings(event.id, agentId, threats);
  }

  const reason = injection
    ? 'Prompt tries to override the agent instructions.'
    : violating.length
      ? violating.map((decision) => `${decision.control_id} would be ${decision.state.toLowerCase()}: ${decision.evidence?.message || decision.state}`).join(' ')
      : 'Controls hold for this call.';

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
