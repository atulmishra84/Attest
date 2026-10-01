const prisma = require('./prisma');
const logger = require('./logger');

const INJECTION = [
  /ignore (all |any )?(previous|prior|above) instructions/i,
  /do not follow (the )?(rules|policy)/i,
];

const JAILBREAK = [
  /\bjailbreak\b/i,
  /you are now/i,
  /pretend you have no (restrictions|rules|limits)/i,
  /developer mode/i,
];

const EXTRACTION = [
  /reveal the system prompt/i,
  /(show|print|repeat|dump) (me )?(your )?(system|hidden) prompt/i,
  /what are your (system )?instructions/i,
];

const MALICIOUS_CODE = /\b(reverse shell|ransomware|keylogger|malware|exploit code)\b/i;
const POISON = /data poison|poison(?:ed|ing)? (?:the )?(?:training|model|dataset)|training[- ]data injection|model backdoor/i;

const ADVERSARIAL = ['PROMPT_INJECTION', 'JAILBREAK', 'SYSTEM_PROMPT_EXTRACTION'];
const OUTPUT_KINDS = ['MALICIOUS_CODE', 'TOXIC_OUTPUT', 'DATA_POISONING'];
const BLOCKING_KINDS = new Set([...ADVERSARIAL, ...OUTPUT_KINDS]);

const SENSITIVE = /patient|\bphi\b|\bssn\b|api[_-]?key|secret|password/i;
const DESTRUCTIVE = /^(delete|drop|exec|shell)$/i;

function clip(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function flagSet(flags) {
  return new Set((Array.isArray(flags) ? flags : []).map((flag) => String(flag).toLowerCase()));
}

function tokensOf(payload) {
  const usage = payload && typeof payload === 'object' ? payload.usage : null;
  const value = Number(payload?.tokens ?? payload?.token_count ?? usage?.total_tokens);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function volumeSpike(current, previous) {
  if (current >= 8000 && previous === 0) return true;
  if (previous >= 200 && current >= previous * 3 && current >= 2000) return true;
  return false;
}

function inspectEvent({ prompt, tool, toolInput, output, flags, operation, resource, capability }) {
  const findings = [];
  const promptText = [prompt, toolInput].filter(Boolean).join('\n');
  const outputText = String(output || '');
  const flagsSeen = flagSet(flags);
  const call = [operation, tool, resource].filter(Boolean).join(' ');

  if (promptText && INJECTION.some((pattern) => pattern.test(promptText))) {
    findings.push({
      kind: 'PROMPT_INJECTION',
      severity: 'high',
      summary: 'Blocked prompt injection',
      evidence: clip(promptText),
    });
  }

  if (promptText && JAILBREAK.some((pattern) => pattern.test(promptText))) {
    findings.push({
      kind: 'JAILBREAK',
      severity: 'high',
      summary: 'Blocked jailbreak attempt',
      evidence: clip(promptText),
    });
  }

  if (promptText && EXTRACTION.some((pattern) => pattern.test(promptText))) {
    findings.push({
      kind: 'SYSTEM_PROMPT_EXTRACTION',
      severity: 'high',
      summary: 'Blocked system prompt extraction',
      evidence: clip(promptText),
    });
  }

  if (flagsSeen.has('malicious_code') || MALICIOUS_CODE.test(outputText) || MALICIOUS_CODE.test(promptText)) {
    findings.push({
      kind: 'MALICIOUS_CODE',
      severity: 'high',
      summary: 'Model output matched malicious code',
      evidence: clip(outputText || promptText),
    });
  }

  if (flagsSeen.has('toxic') || flagsSeen.has('toxicity')) {
    findings.push({
      kind: 'TOXIC_OUTPUT',
      severity: 'high',
      summary: 'Model output flagged as toxic',
      evidence: clip(outputText || 'toxic output flag'),
    });
  }

  if (flagsSeen.has('data_poisoning') || POISON.test(promptText) || POISON.test(outputText)) {
    findings.push({
      kind: 'DATA_POISONING',
      severity: 'high',
      summary: 'Data poisoning flag on this call',
      evidence: clip(outputText || promptText || 'data poisoning flag'),
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
        output: payload.output,
        flags: payload.flags,
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

async function noteVolume(agentId, eventId) {
  const windowMs = 15 * 60 * 1000;
  const now = Date.now();
  const events = await prisma.runtimeEvent.findMany({
    where: { agentId, deletedAt: null, timestamp: { gte: new Date(now - (2 * windowMs)) } },
    select: { timestamp: true, rawPayload: true },
  });
  let current = 0;
  let previous = 0;
  for (const event of events) {
    const count = tokensOf(event.rawPayload);
    if (new Date(event.timestamp).getTime() >= now - windowMs) current += count;
    else previous += count;
  }
  if (!volumeSpike(current, previous)) return null;
  const recent = await prisma.threatFinding.findFirst({
    where: { agentId, kind: 'TOKEN_SPIKE', createdAt: { gte: new Date(now - windowMs) } },
  });
  if (recent) return null;
  const finding = {
    kind: 'TOKEN_SPIKE',
    severity: 'high',
    summary: 'Token use spiked against the prior window',
    evidence: `${current} tokens in 15 minutes versus ${previous} in the previous 15 minutes`,
  };
  await recordFindings(eventId, agentId, [finding]);
  return finding;
}

async function ledgerReport() {
  await ensureThreatScan();
  const since = new Date(Date.now() - (24 * 60 * 60 * 1000));
  const findings = await prisma.threatFinding.findMany({
    where: { createdAt: { gte: since }, agent: { deletedAt: null } },
    include: { agent: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 400,
  });
  const eventIds = findings.map((finding) => finding.eventId).filter((id) => id != null);
  const events = eventIds.length
    ? await prisma.runtimeEvent.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, eventType: true, rawPayload: true },
    })
    : [];
  const blocked = new Set(events.filter((event) => event.eventType === 'GATE' || event.rawPayload?.gate).map((event) => event.id));

  function metric(kind) {
    const rows = findings.filter((finding) => finding.kind === kind);
    return {
      kind,
      total: rows.length,
      blocked: rows.filter((finding) => blocked.has(finding.eventId)).length,
    };
  }

  const hourAgo = new Date(Date.now() - (60 * 60 * 1000));
  const priorStart = new Date(Date.now() - (2 * 60 * 60 * 1000));
  const usageEvents = await prisma.runtimeEvent.findMany({
    where: { deletedAt: null, timestamp: { gte: priorStart }, agent: { deletedAt: null } },
    select: { agentId: true, timestamp: true, rawPayload: true, agent: { select: { name: true } } },
  });
  const usage = new Map();
  for (const event of usageEvents) {
    const count = tokensOf(event.rawPayload);
    if (!count) continue;
    const row = usage.get(event.agentId) || { agentId: event.agentId, agentName: event.agent.name, tokens: 0, prior: 0 };
    if (new Date(event.timestamp) >= hourAgo) row.tokens += count;
    else row.prior += count;
    usage.set(event.agentId, row);
  }

  const mapRow = (finding) => ({
    id: finding.id,
    agentId: finding.agentId,
    agentName: finding.agent.name,
    kind: finding.kind,
    severity: finding.severity,
    summary: finding.summary,
    evidence: finding.evidence,
    blocked: blocked.has(finding.eventId),
    createdAt: finding.createdAt,
  });

  return {
    generatedAt: new Date().toISOString(),
    interceptions: {
      promptInjection: metric('PROMPT_INJECTION'),
      jailbreak: metric('JAILBREAK'),
      systemPrompt: metric('SYSTEM_PROMPT_EXTRACTION'),
    },
    output: findings.filter((finding) => OUTPUT_KINDS.includes(finding.kind)).map(mapRow),
    volume: [...usage.values()]
      .map((row) => ({ ...row, spike: volumeSpike(row.tokens, row.prior) }))
      .sort((left, right) => right.tokens - left.tokens),
    alerts: findings.filter((finding) => finding.kind === 'TOKEN_SPIKE').map(mapRow),
  };
}

module.exports = {
  inspectEvent,
  recordFindings,
  ensureThreatScan,
  noteVolume,
  ledgerReport,
  volumeSpike,
  tokensOf,
  BLOCKING_KINDS,
  ADVERSARIAL,
};
