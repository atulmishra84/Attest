const prisma = require('./prisma');

const CATEGORIES = [
  { id: 'name', label: 'Names' },
  { id: 'ssn', label: 'Social Security numbers' },
  { id: 'source_code', label: 'Source code' },
  { id: 'financial', label: 'Financial credentials' },
];

const NAME = /\b(?:full name|name)\s*[:=]\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/gi;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const CODE_FENCE = /```[\s\S]*?```/g;
const CODE_LINE = /\b(?:function\s+\w+\s*\(|class\s+\w+|import\s+[\w*{}\s]+\s+from\s+|def\s+\w+\s*\(|public\s+class\s+\w+)/g;
const SECRET = /(?:api[_-]?key|client[_-]?secret|password|account(?:\s+number)?)\s*[:=]\s*\S+/gi;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;

function emptyCounts() {
  return { name: 0, ssn: 0, source_code: 0, financial: 0 };
}

function luhn(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function maskCards(text, counts) {
  return text.replace(CARD, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19 || !luhn(digits)) return match;
    counts.financial += 1;
    return '[FINANCIAL]';
  });
}

function redactText(value) {
  const counts = emptyCounts();
  let text = String(value || '');
  if (!text) return { text, counts };
  text = text.replace(NAME, () => { counts.name += 1; return '[NAME]'; });
  text = text.replace(SSN, () => { counts.ssn += 1; return '[SSN]'; });
  text = text.replace(CODE_FENCE, () => { counts.source_code += 1; return '[SOURCE_CODE]'; });
  text = text.replace(CODE_LINE, () => { counts.source_code += 1; return '[SOURCE_CODE]'; });
  text = text.replace(SECRET, () => { counts.financial += 1; return '[FINANCIAL]'; });
  text = maskCards(text, counts);
  return { text, counts };
}

function addCounts(left, right) {
  for (const key of Object.keys(left)) left[key] += right[key] || 0;
  return left;
}

function redactFields(fields) {
  const counts = emptyCounts();
  const next = { ...fields };
  for (const key of ['prompt', 'tool_input', 'output', 'resource']) {
    if (!next[key]) continue;
    const masked = redactText(next[key]);
    next[key] = masked.text;
    addCounts(counts, masked.counts);
  }
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (total) next.redactions = counts;
  return { fields: next, counts };
}

function oversharingReasons(agent) {
  const payload = agent.identity?.payload || {};
  const classes = (Array.isArray(payload.dataClasses) ? payload.dataClasses : []).filter((item) => item && item !== 'none');
  const stores = Array.isArray(payload.stores) ? payload.stores : [];
  const sensitive = classes.some((item) => /phi|pii|secret|financial|source|internal|credential/i.test(item));
  const excess = (payload.scopes || []).some((scope) => scope.excess);
  const reasons = [];
  if (stores.length && !agent.owner) reasons.push('RAG store has no owner, so authorization is missing');
  if (stores.length && excess) reasons.push('RAG store is reachable through an excess tool');
  if (stores.length && payload.internetAccess) reasons.push('RAG store can be sent to a public model');
  if (!stores.length && sensitive && !agent.owner) reasons.push('Sensitive data is in reach of an agent with no owner');
  if (!stores.length && sensitive && excess) reasons.push('Sensitive data is reachable through an excess tool');
  return { classes, stores, reasons };
}

async function privacyReport() {
  const since = new Date(Date.now() - (24 * 60 * 60 * 1000));
  const events = await prisma.runtimeEvent.findMany({
    where: { deletedAt: null, timestamp: { gte: since } },
    select: { timestamp: true, rawPayload: true },
  });
  const totals = emptyCounts();
  const hours = Array.from({ length: 24 }, (_, index) => ({ index, ...emptyCounts() }));
  for (const event of events) {
    const payload = event.rawPayload || {};
    const counts = payload.redactions || redactText([payload.prompt, payload.tool_input, payload.output, payload.resource].filter(Boolean).join('\n')).counts;
    addCounts(totals, counts);
    const age = Date.now() - new Date(event.timestamp).getTime();
    const slot = Math.min(23, Math.max(0, 23 - Math.floor(age / (60 * 60 * 1000))));
    addCounts(hours[slot], counts);
  }
  const agents = await prisma.agent.findMany({
    where: { deletedAt: null },
    include: { identity: true },
    orderBy: { name: 'asc' },
  });
  const oversharing = [];
  for (const agent of agents) {
    const posture = oversharingReasons(agent);
    if (!posture.reasons.length) continue;
    oversharing.push({
      agentId: agent.id,
      agentName: agent.name,
      dataClasses: posture.classes,
      stores: posture.stores,
      reasons: posture.reasons,
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    window: '24h',
    totals,
    categories: CATEGORIES.map((category) => ({ ...category, count: totals[category.id] })),
    hours,
    oversharing,
  };
}

module.exports = { redactText, redactFields, oversharingReasons, privacyReport, CATEGORIES };
