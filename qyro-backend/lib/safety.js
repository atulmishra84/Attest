const prisma = require('./prisma');

const HATE_FLAGS = new Set(['hate', 'hate_speech', 'discriminatory']);
const ABUSE_FLAGS = new Set(['harassment', 'abusive']);
const SAFETY_BLOCKING = new Set(['HATE_SPEECH', 'HARASSMENT']);
const ALERT_AT = 60;

function clip(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function flagSet(flags) {
  return new Set((Array.isArray(flags) ? flags : []).map((flag) => String(flag).toLowerCase()));
}

function unitScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return number <= 1 ? number : number / 100;
}

function words(text) {
  return String(text || '').toLowerCase().match(/[a-z0-9]{4,}/g) || [];
}

function corpusText(input) {
  const chunks = [input.sources, input.context, input.documents].flat().filter(Boolean);
  return chunks.map((item) => (typeof item === 'string' ? item : item.text || item.content || item.body || '')).join('\n');
}

function hallucinationIndex(input) {
  const supplied = unitScore(input.hallucinationScore ?? input.hallucination_score);
  if (supplied != null) return Math.round(supplied * 100);
  const grounded = unitScore(input.groundedness);
  if (grounded != null) return Math.round((1 - grounded) * 100);
  const source = new Set(words(corpusText(input)));
  const output = words(input.output);
  if (output.length < 8 || source.size < 8) return null;
  const hit = output.filter((word) => source.has(word)).length;
  return Math.round((1 - (hit / output.length)) * 100);
}

function attributeOf(value) {
  const raw = String(value || '').trim();
  if (/\s/.test(raw)) return '';
  const text = raw.toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,32}$/.test(text)) return '';
  return text;
}

function domainOf(value) {
  const text = String(value || '').toLowerCase();
  if (/\b(hr|hiring|recruit|workforce|people ops)\b/.test(text)) return 'HR';
  if (/\b(finance|financial|credit|lending|underwriting)\b/.test(text)) return 'Finance';
  if (/\b(legal|counsel|litigation|contract)\b/.test(text)) return 'Legal';
  return '';
}

function assessSafety(input) {
  const findings = [];
  const flags = flagSet(input.flags);
  const scores = input.safetyScores || input.safety_scores || {};
  const hateScore = unitScore(scores.hate);
  const abuseScore = unitScore(scores.harassment ?? scores.abusive);
  const output = String(input.output || '');

  if ([...HATE_FLAGS].some((flag) => flags.has(flag)) || (hateScore != null && hateScore >= 0.7)) {
    findings.push({
      kind: 'HATE_SPEECH',
      severity: 'high',
      summary: 'Model output flagged for hate or discriminatory language',
      evidence: clip(output || 'hate score'),
    });
  }
  if ([...ABUSE_FLAGS].some((flag) => flags.has(flag)) || (abuseScore != null && abuseScore >= 0.7)) {
    findings.push({
      kind: 'HARASSMENT',
      severity: 'high',
      summary: 'Model output flagged for abusive or harassing language',
      evidence: clip(output || 'harassment score'),
    });
  }

  const hallucination = hallucinationIndex(input);
  if (hallucination != null && hallucination >= ALERT_AT) {
    findings.push({
      kind: 'HALLUCINATION',
      severity: 'medium',
      summary: 'Answer is weakly grounded in the retrieved sources',
      evidence: `hallucination index ${hallucination}`,
    });
  }

  const biasScore = unitScore(input.biasScore ?? input.bias_score);
  const attribute = attributeOf(input.biasAttribute ?? input.bias_attribute ?? input.demographic);
  const workflow = domainOf(input.workflow || input.domain);
  if (biasScore != null && biasScore >= 0.7) {
    findings.push({
      kind: 'BIAS_ALERT',
      severity: 'medium',
      summary: workflow
        ? `Fairness score is high on a ${workflow} workflow`
        : 'Fairness score is high for this call',
      evidence: attribute ? `${attribute} ${Math.round(biasScore * 100)}` : `bias ${Math.round(biasScore * 100)}`,
    });
  }

  return {
    findings,
    metrics: {
      hallucination,
      biasScore: biasScore == null ? null : Math.round(biasScore * 100) / 100,
      biasAttribute: attribute,
      workflow,
    },
  };
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

async function safetyReport() {
  const now = Date.now();
  const since = new Date(now - (7 * 24 * 60 * 60 * 1000));
  const day = new Date(now - (24 * 60 * 60 * 1000));
  const [findings, events, agents] = await Promise.all([
    prisma.threatFinding.findMany({
      where: {
        kind: { in: ['HATE_SPEECH', 'HARASSMENT', 'TOXIC_OUTPUT', 'HALLUCINATION', 'BIAS_ALERT'] },
        createdAt: { gte: day },
        agent: { deletedAt: null },
      },
      include: { agent: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 80,
    }),
    prisma.runtimeEvent.findMany({
      where: { deletedAt: null, timestamp: { gte: since }, agent: { deletedAt: null } },
      select: { agentId: true, timestamp: true, rawPayload: true },
    }),
    prisma.agent.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, identity: { select: { payload: true } } },
    }),
  ]);

  const count = (kind) => findings.filter((finding) => finding.kind === kind).length;
  const byAgent = new Map();
  const biasDays = new Map();
  const attributes = new Map();
  for (let offset = 6; offset >= 0; offset -= 1) {
    biasDays.set(dayKey(now - (offset * 24 * 60 * 60 * 1000)), { samples: 0, total: 0 });
  }
  for (const event of events) {
    const metrics = event.rawPayload?.guardrails || {};
    if (metrics.hallucination != null) {
      const row = byAgent.get(event.agentId) || { samples: 0, total: 0, alerts: 0 };
      row.samples += 1;
      row.total += Number(metrics.hallucination) || 0;
      if (Number(metrics.hallucination) >= ALERT_AT) row.alerts += 1;
      byAgent.set(event.agentId, row);
    }
    if (metrics.biasScore != null) {
      const key = dayKey(event.timestamp);
      if (biasDays.has(key)) {
        const bucket = biasDays.get(key);
        bucket.samples += 1;
        bucket.total += Number(metrics.biasScore);
      }
      const attribute = metrics.biasAttribute || 'unspecified';
      const group = attributes.get(attribute) || { attribute, samples: 0, total: 0, workflows: {} };
      group.samples += 1;
      group.total += Number(metrics.biasScore);
      if (metrics.workflow) group.workflows[metrics.workflow] = (group.workflows[metrics.workflow] || 0) + 1;
      attributes.set(attribute, group);
    }
  }

  const rag = agents.filter((agent) => Array.isArray(agent.identity?.payload?.stores) && agent.identity.payload.stores.length)
    .map((agent) => {
      const stats = byAgent.get(agent.id);
      const index = stats ? Math.round(stats.total / stats.samples) : null;
      return {
        agentId: agent.id,
        agentName: agent.name,
        stores: agent.identity.payload.stores.map((store) => store.name).filter(Boolean),
        index,
        samples: stats?.samples || 0,
        alert: index != null && index >= ALERT_AT,
      };
    })
    .sort((left, right) => (right.index || 0) - (left.index || 0) || left.agentName.localeCompare(right.agentName));

  return {
    generatedAt: new Date().toISOString(),
    alertAt: ALERT_AT,
    toxicity: {
      hate: count('HATE_SPEECH'),
      harassment: count('HARASSMENT'),
      toxic: count('TOXIC_OUTPUT'),
    },
    alerts: findings.map((finding) => ({
      id: finding.id,
      agentId: finding.agentId,
      agentName: finding.agent.name,
      kind: finding.kind,
      summary: finding.summary,
      evidence: finding.evidence,
      createdAt: finding.createdAt,
    })),
    rag,
    bias: {
      days: [...biasDays.entries()].map(([date, bucket]) => ({
        date: date.slice(5),
        samples: bucket.samples,
        score: bucket.samples ? Math.round((100 * bucket.total) / bucket.samples) : null,
      })),
      attributes: [...attributes.values()].map((group) => ({
        attribute: group.attribute,
        samples: group.samples,
        score: Math.round((100 * group.total) / group.samples),
        workflows: group.workflows,
      })).sort((left, right) => right.score - left.score),
    },
  };
}

module.exports = {
  assessSafety,
  safetyReport,
  hallucinationIndex,
  SAFETY_BLOCKING,
  ALERT_AT,
};
