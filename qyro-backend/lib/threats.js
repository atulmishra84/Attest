const prisma = require('./prisma');
const logger = require('./logger');

const INJECTION = [
  /ignore (all |any )?(previous|prior|above) instructions/i,
  /reveal the system prompt/i,
  /you are now/i,
  /\bjailbreak\b/i,
  /do not follow (the )?(rules|policy)/i,
];

const SENSITIVE = /patient|\bphi\b|\bssn\b|api[_-]?key|secret|password/i;
const DESTRUCTIVE = /^(delete|drop|exec|shell)$/i;

function clip(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function inspectEvent({ prompt, tool, toolInput, operation, resource, capability }) {
  const findings = [];
  const promptText = [prompt, toolInput].filter(Boolean).join('\n');
  const call = [operation, tool, resource].filter(Boolean).join(' ');

  if (promptText && INJECTION.some((pattern) => pattern.test(promptText))) {
    findings.push({
      kind: 'PROMPT_INJECTION',
      severity: 'high',
      summary: 'Prompt tries to override the agent instructions',
      evidence: clip(promptText),
    });
  }

  if (SENSITIVE.test(call) || SENSITIVE.test(promptText)) {
    findings.push({
      kind: 'SENSITIVE_DISCLOSURE',
      severity: 'high',
      summary: 'Call touches sensitive data',
      evidence: clip(call || promptText),
    });
  }

  const scopes = Array.isArray(capability?.scopes) ? capability.scopes : [];
  const haystack = `${resource || ''} ${tool || ''} ${operation || ''}`.toLowerCase();
  const excessHit = scopes.some((scope) => {
    if (!scope.excess) return false;
    const token = String(scope.resource || scope.name || '').toLowerCase();
    return token && haystack.includes(token.split('.')[0]);
  });
  if (DESTRUCTIVE.test(operation || '') || DESTRUCTIVE.test(tool || '') || excessHit) {
    findings.push({
      kind: 'TOOL_MISUSE',
      severity: 'high',
      summary: excessHit ? 'Tool call uses an excess permission' : 'Destructive tool call',
      evidence: clip(call || tool),
    });
  }

  return findings;
}

async function recordFindings(eventId, agentId, findings) {
  for (const finding of findings) {
    await prisma.threatFinding.upsert({
      where: { eventId_kind: { eventId, kind: finding.kind } },
      create: { agentId, eventId, ...finding },
      update: { summary: finding.summary, evidence: finding.evidence, severity: finding.severity },
    });
  }
}

let scanned = false;

async function ensureThreatScan() {
  if (scanned) return;
  scanned = true;
  try {
    const events = await prisma.runtimeEvent.findMany({
      where: { deletedAt: null },
      include: { agent: { include: { identity: true } } },
      orderBy: { timestamp: 'desc' },
      take: 500,
    });
    for (const event of events) {
      const payload = event.rawPayload || {};
      const findings = inspectEvent({
        prompt: payload.prompt,
        tool: payload.tool,
        toolInput: payload.tool_input,
        operation: event.operation,
        resource: event.resource,
        capability: event.agent?.identity?.payload,
      });
      if (findings.length) await recordFindings(event.id, event.agentId, findings);
    }
  } catch (err) {
    scanned = false;
    logger.error({ err: err.message }, 'threat scan failed');
    throw err;
  }
}

module.exports = { inspectEvent, recordFindings, ensureThreatScan };
