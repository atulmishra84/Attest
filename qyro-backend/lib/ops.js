const prisma = require('./prisma');

const LATENCY_MS = 4000;
const TTFT_MS = 1500;

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function unitToHundred(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return number <= 1 ? Math.round(number * 100) : Math.round(number);
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1));
  return sorted[index];
}

function driftOf(recent, prior) {
  if (recent.length < 3 || prior.length < 3) return null;
  const average = (rows) => rows.reduce((sum, value) => sum + value, 0) / rows.length;
  const recentAvg = Math.round(average(recent));
  const priorAvg = Math.round(average(prior));
  const drop = priorAvg - recentAvg;
  return { recent: recentAvg, prior: priorAvg, drop, degraded: drop >= 10 };
}

function assessOps(input) {
  const payload = input.raw_payload || input.rawPayload || {};
  const metrics = {
    model: input.model || payload.model || null,
    ttftMs: numberOrNull(input.ttft_ms ?? input.ttft ?? payload.ttft_ms),
    latencyMs: numberOrNull(input.latency_ms ?? input.latency ?? input.duration_ms ?? payload.latency_ms),
    scanMs: numberOrNull(input.scan_ms ?? payload.scan_ms),
    evalScore: unitToHundred(input.eval_score ?? input.accuracy ?? payload.eval_score),
    primaryModel: input.primary_model || payload.primary_model || null,
    routedTo: input.routed_to || input.fallback_model || payload.routed_to || payload.fallback_model || null,
    providerError: input.provider_error || payload.provider_error || null,
  };
  const findings = [];
  const slowLatency = metrics.latencyMs != null && metrics.latencyMs >= LATENCY_MS;
  const slowToken = metrics.ttftMs != null && metrics.ttftMs >= TTFT_MS;
  if (slowLatency || slowToken) {
    findings.push({
      kind: 'LATENCY_HIGH',
      severity: 'medium',
      summary: 'Model response exceeded the latency budget',
      evidence: `latency ${metrics.latencyMs ?? '—'}ms · ttft ${metrics.ttftMs ?? '—'}ms`,
    });
  }
  return { findings, metrics };
}

async function opsReport() {
  const now = Date.now();
  const since = new Date(now - (7 * 24 * 60 * 60 * 1000));
  const day = now - (24 * 60 * 60 * 1000);
  const [events, agents, alerts] = await Promise.all([
    prisma.runtimeEvent.findMany({
      where: { deletedAt: null, timestamp: { gte: since }, agent: { deletedAt: null } },
      select: { timestamp: true, rawPayload: true, agent: { select: { model: true, name: true } } },
    }),
    prisma.agent.findMany({
      where: { deletedAt: null },
      select: { model: true },
    }),
    prisma.threatFinding.findMany({
      where: { kind: 'LATENCY_HIGH', createdAt: { gte: since }, agent: { deletedAt: null } },
      include: { agent: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
  ]);

  const models = new Map();
  const ensure = (name) => {
    const key = name || 'Unknown model';
    if (!models.has(key)) {
      models.set(key, { model: key, calls: 0, ttft: [], latency: [], scan: [], recent: [], prior: [] });
    }
    return models.get(key);
  };
  for (const agent of agents) {
    if (agent.model) ensure(agent.model).inventory = true;
  }

  const routes = new Map();
  for (const event of events) {
    const metrics = event.rawPayload?.guardrails || {};
    const model = metrics.model || event.agent?.model;
    if (metrics.ttftMs == null && metrics.latencyMs == null && metrics.evalScore == null && !metrics.routedTo) continue;
    const row = ensure(model);
    row.calls += 1;
    if (metrics.ttftMs != null) row.ttft.push(metrics.ttftMs);
    if (metrics.latencyMs != null) row.latency.push(metrics.latencyMs);
    if (metrics.scanMs != null) row.scan.push(metrics.scanMs);
    if (metrics.evalScore != null) {
      const book = new Date(event.timestamp).getTime() >= day ? row.recent : row.prior;
      book.push(metrics.evalScore);
    }
    if (metrics.routedTo && metrics.primaryModel && metrics.routedTo !== metrics.primaryModel) {
      const key = `${metrics.primaryModel} → ${metrics.routedTo}`;
      const route = routes.get(key) || { primary: metrics.primaryModel, backup: metrics.routedTo, routes: 0, failures: 0 };
      route.routes += 1;
      if (metrics.providerError) route.failures += 1;
      routes.set(key, route);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    budgets: { latencyMs: LATENCY_MS, ttftMs: TTFT_MS },
    models: [...models.values()].map((row) => {
      const drift = driftOf(row.recent, row.prior);
      const latencyP95 = percentile(row.latency, 0.95);
      const scanP95 = percentile(row.scan, 0.95);
      return {
        model: row.model,
        calls: row.calls,
        ttftP50: percentile(row.ttft, 0.5),
        ttftP95: percentile(row.ttft, 0.95),
        latencyP95,
        scanShare: latencyP95 && scanP95 ? Math.round((100 * scanP95) / latencyP95) : null,
        drift,
        slow: (latencyP95 != null && latencyP95 >= LATENCY_MS) || ((percentile(row.ttft, 0.95) || 0) >= TTFT_MS),
      };
    }).sort((left, right) => right.calls - left.calls || left.model.localeCompare(right.model)),
    fallbacks: [...routes.values()].sort((left, right) => right.routes - left.routes),
    alerts: alerts.map((finding) => ({
      id: finding.id,
      agentId: finding.agentId,
      agentName: finding.agent.name,
      summary: finding.summary,
      evidence: finding.evidence,
      createdAt: finding.createdAt,
    })),
  };
}

module.exports = { assessOps, opsReport, driftOf, percentile, LATENCY_MS, TTFT_MS };
