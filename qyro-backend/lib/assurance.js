const prisma = require('./prisma');
const { evaluate } = require('./opa');
const { resolveCapability } = require('./capability/resolve');
const { emitAlert } = require('./alerts');
const { publish } = require('./stream');
const logger = require('./logger');

const WORSE = new Set(['INEFFECTIVE', 'VIOLATED', 'BLOCKED_VIOLATION', 'UNKNOWN']);

async function loadEvaluationContext(agentId) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { identity: true },
  });
  if (!agent || agent.deletedAt) return null;
  const controls = await prisma.control.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, requirementType: true },
  });
  const capability = agent.identity?.payload || { scopes: [] };
  return { agent, controls, capability };
}

async function evaluateAndStore(agentId, event) {
  const context = await loadEvaluationContext(agentId);
  if (!context) {
    const error = new Error('Agent not found');
    error.status = 404;
    throw error;
  }

  const decisions = await evaluate({
    event: event || {},
    capability: context.capability,
    controls: context.controls,
  });
  const known = new Set(context.controls.map((control) => control.id));
  const stored = [];

  for (const decision of decisions) {
    if (!known.has(decision.control_id)) continue;
    const row = await upsertControlResult(agentId, decision, event);
    stored.push(row);
  }

  publish({
    type: 'telemetry',
    agentId,
    violations: stored.filter((row) => row.state === 'VIOLATED').length,
  });

  return stored;
}

const SEVERITY = {
  NOT_TESTED: 0,
  EFFECTIVE: 1,
  UNKNOWN: 2,
  INEFFECTIVE: 3,
  BLOCKED_VIOLATION: 4,
  VIOLATED: 5,
};

async function upsertControlResult(agentId, decision, event) {
  const existing = await prisma.controlResult.findFirst({
    where: { agentId, controlId: decision.control_id, deletedAt: null },
    orderBy: { evaluatedAt: 'desc' },
  });
  if (existing && event?.kind === 'posture' && (SEVERITY[existing.state] || 0) > (SEVERITY[decision.state] || 0)) {
    return existing;
  }
  const evidencePayload = decision.evidence || { message: decision.state };
  const data = {
    state: decision.state,
    evidencePayload,
    evaluatedAt: new Date(),
  };
  const row = existing
    ? await prisma.controlResult.update({ where: { id: existing.id }, data })
    : await prisma.controlResult.create({
      data: { agentId, controlId: decision.control_id, ...data },
    });

  if (existing && existing.state === 'EFFECTIVE' && WORSE.has(decision.state)) {
    const message = `${agentId} ${decision.control_id} drifted ${existing.state} → ${decision.state}`;
    const alert = await prisma.driftAlert.create({
      data: {
        agentId,
        controlId: decision.control_id,
        fromState: existing.state,
        toState: decision.state,
        message,
      },
    });
    await emitAlert({
      id: alert.id,
      agentId,
      controlId: decision.control_id,
      fromState: existing.state,
      toState: decision.state,
      message,
    });
  }

  return row;
}

async function refreshCapability(agentId) {
  const context = await loadEvaluationContext(agentId);
  if (!context) return null;
  const graph = resolveCapability(context.agent, context.agent.identity);
  const snapshot = await prisma.capabilitySnapshot.create({
    data: {
      agentId,
      provider: graph.provider,
      nodes: graph.nodes,
      edges: graph.edges,
      source: graph.source,
    },
  });
  logger.info({ agentId, snapshotId: snapshot.id }, 'capability snapshot stored');
  return { ...graph, evaluatedAt: snapshot.createdAt };
}

async function latestCapability(agentId) {
  const snapshot = await prisma.capabilitySnapshot.findFirst({
    where: { agentId },
    orderBy: { createdAt: 'desc' },
  });
  if (snapshot) {
    return {
      provider: snapshot.provider,
      source: snapshot.source,
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      evaluatedAt: snapshot.createdAt,
    };
  }
  return refreshCapability(agentId);
}

module.exports = { evaluateAndStore, refreshCapability, latestCapability, loadEvaluationContext };
