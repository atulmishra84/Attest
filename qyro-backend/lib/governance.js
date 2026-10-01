const prisma = require('./prisma');
const { citationsFor, readinessScore } = require('./citations');
const { tokensOf, volumeSpike } = require('./threats');

const FOCUS = ['EU AI Act', 'ISO/IEC 42001', 'NIST AI RMF'];
const RATE_PER_MILLION = 3;

function usd(tokens) {
  return Math.round((tokens / 1_000_000) * RATE_PER_MILLION * 100) / 100;
}

async function frameworkCards() {
  const results = await prisma.controlResult.findMany({
    where: { deletedAt: null, agent: { deletedAt: null } },
    orderBy: { evaluatedAt: 'desc' },
  });
  const latest = new Map();
  for (const result of results) {
    const key = `${result.agentId}:${result.controlId}`;
    if (!latest.has(key)) latest.set(key, result);
  }
  const groups = new Map();
  for (const result of latest.values()) {
    for (const cite of citationsFor(result.controlId)) {
      const key = `${cite.framework} ${cite.citation}`;
      if (!groups.has(key)) {
        groups.set(key, {
          framework: cite.framework,
          citation: cite.citation,
          title: cite.title,
          effective: 0,
          violated: 0,
          ineffective: 0,
          other: 0,
        });
      }
      const bucket = groups.get(key);
      if (result.state === 'EFFECTIVE') bucket.effective += 1;
      else if (result.state === 'VIOLATED' || result.state === 'BLOCKED_VIOLATION') bucket.violated += 1;
      else if (result.state === 'INEFFECTIVE') bucket.ineffective += 1;
      else bucket.other += 1;
    }
  }
  const byFramework = new Map(FOCUS.map((name) => [name, {
    framework: name,
    effective: 0,
    violated: 0,
    ineffective: 0,
    other: 0,
    citations: [],
  }]));
  for (const row of groups.values()) {
    if (!byFramework.has(row.framework)) continue;
    const card = byFramework.get(row.framework);
    card.effective += row.effective;
    card.violated += row.violated;
    card.ineffective += row.ineffective;
    card.other += row.other;
    card.citations.push({ ...row, score: readinessScore(row) });
  }
  return [...byFramework.values()].map((card) => ({
    ...card,
    score: readinessScore(card),
    citations: card.citations.sort((left, right) => left.citation.localeCompare(right.citation)),
  }));
}

async function spendReport() {
  const since = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
  const [agents, events] = await Promise.all([
    prisma.agent.findMany({
      where: { deletedAt: null },
      include: { identity: true },
    }),
    prisma.runtimeEvent.findMany({
      where: { deletedAt: null, timestamp: { gte: since }, agent: { deletedAt: null } },
      select: { agentId: true, timestamp: true, rawPayload: true },
    }),
  ]);
  const departmentOf = new Map();
  for (const agent of agents) {
    const payload = agent.identity?.payload || {};
    departmentOf.set(agent.id, payload.department || agent.owner || 'Unassigned');
  }
  const departments = new Map();
  const keys = new Map();
  let totalTokens = 0;
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const recent = new Map();
  const prior = new Map();
  const recentKeys = new Map();
  const priorKeys = new Map();
  for (const event of events) {
    const tokens = tokensOf(event.rawPayload);
    if (!tokens) continue;
    totalTokens += tokens;
    const department = departmentOf.get(event.agentId) || 'Unassigned';
    const dept = departments.get(department) || { name: department, tokens: 0, agents: new Set() };
    dept.tokens += tokens;
    dept.agents.add(event.agentId);
    departments.set(department, dept);
    const keyName = event.rawPayload?.api_key_name || event.rawPayload?.key_prefix;
    if (keyName) {
      const row = keys.get(keyName) || { name: keyName, tokens: 0 };
      row.tokens += tokens;
      keys.set(keyName, row);
    }
    const at = new Date(event.timestamp).getTime();
    const currentHour = at >= now - hour;
    const previousHour = at >= now - (2 * hour) && at < now - hour;
    if (currentHour) {
      recent.set(department, (recent.get(department) || 0) + tokens);
      if (keyName) recentKeys.set(keyName, (recentKeys.get(keyName) || 0) + tokens);
    } else if (previousHour) {
      prior.set(department, (prior.get(department) || 0) + tokens);
      if (keyName) priorKeys.set(keyName, (priorKeys.get(keyName) || 0) + tokens);
    }
  }
  for (const agent of agents) {
    const name = departmentOf.get(agent.id) || 'Unassigned';
    if (!departments.has(name)) departments.set(name, { name, tokens: 0, agents: new Set() });
    departments.get(name).agents.add(agent.id);
  }
  const deptRows = [...departments.values()].map((row) => ({
    name: row.name,
    tokens: row.tokens,
    usd: usd(row.tokens),
    agents: row.agents.size,
    spike: volumeSpike(recent.get(row.name) || 0, prior.get(row.name) || 0),
  })).sort((left, right) => right.tokens - left.tokens || right.agents - left.agents);
  const tokenRows = deptRows.filter((row) => row.tokens > 0).map((row) => row.tokens).sort((a, b) => a - b);
  const median = tokenRows.length ? tokenRows[Math.floor(tokenRows.length / 2)] : 0;
  const flaggedDepartments = deptRows.map((row) => ({
    ...row,
    flag: row.name === 'Unassigned' && row.agents > 0
      ? 'No department to charge'
      : row.spike || (median > 0 && row.tokens >= median * 3 && row.tokens >= 2000)
        ? 'High token use'
        : '',
  }));
  const keyRows = [...keys.values()].map((row) => ({
    ...row,
    usd: usd(row.tokens),
    spike: volumeSpike(recentKeys.get(row.name) || 0, priorKeys.get(row.name) || 0),
  })).sort((left, right) => right.tokens - left.tokens);
  const keyTokens = keyRows.map((row) => row.tokens).sort((a, b) => a - b);
  const keyMedian = keyTokens.length ? keyTokens[Math.floor(keyTokens.length / 2)] : 0;
  return {
    window: '7d',
    ratePerMillion: RATE_PER_MILLION,
    totalTokens,
    estimatedUsd: usd(totalTokens),
    departments: flaggedDepartments,
    keys: keyRows.map((row) => ({
      ...row,
      flag: row.spike || (keyMedian > 0 && row.tokens >= keyMedian * 3 && row.tokens >= 2000)
        ? 'Key above peer keys'
        : '',
    })),
  };
}

async function governanceReport() {
  const [frameworks, spend] = await Promise.all([frameworkCards(), spendReport()]);
  return { generatedAt: new Date().toISOString(), frameworks, spend };
}

module.exports = { governanceReport, readinessScore, usd };
