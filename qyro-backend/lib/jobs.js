const prisma = require('./prisma');
const logger = require('./logger');
const { publish } = require('./stream');
const { emitAlert } = require('./alerts');
const { evaluateAndStore, refreshCapability } = require('./assurance');

const DAY_MS = 24 * 60 * 60 * 1000;

async function capabilityScan() {
  const agents = await prisma.agent.findMany({ where: { deletedAt: null } });
  for (const agent of agents) {
    await refreshCapability(agent.id);
    await evaluateAndStore(agent.id, { kind: 'posture' });
  }
  logger.info({ scanned: agents.length }, 'capability scan finished');
  return { scanned: agents.length };
}

async function staleAgentCheck() {
  const cutoff = new Date(Date.now() - DAY_MS);
  const agents = await prisma.agent.findMany({ where: { deletedAt: null } });
  let flagged = 0;
  for (const agent of agents) {
    const latest = await prisma.runtimeEvent.findFirst({
      where: { agentId: agent.id, deletedAt: null },
      orderBy: { timestamp: 'desc' },
    });
    const stale = !latest || latest.timestamp < cutoff;
    if (!stale || agent.status === 'Quarantined') continue;
    flagged += 1;
    if (agent.status === 'Stale') continue;
    await prisma.agent.update({ where: { id: agent.id }, data: { status: 'Stale' } });
    const message = `${agent.name} has no telemetry in the last 24 hours`;
    await prisma.driftAlert.create({
      data: { agentId: agent.id, toState: 'UNKNOWN', message },
    });
    await emitAlert({ agentId: agent.id, toState: 'UNKNOWN', message });
  }
  return { flagged };
}

async function telemetryDigest() {
  const since = new Date(Date.now() - DAY_MS);
  const events = await prisma.runtimeEvent.findMany({
    where: { timestamp: { gte: since }, deletedAt: null },
    select: { agentId: true },
  });
  const byAgent = {};
  for (const event of events) {
    byAgent[event.agentId] = (byAgent[event.agentId] || 0) + 1;
  }
  const summary = { windowStart: since.toISOString(), events: events.length, byAgent };
  logger.info(summary, 'telemetry digest');
  publish({ type: 'digest', ...summary });
  return summary;
}

async function runJob(name) {
  if (name === 'capability-scan') return capabilityScan();
  if (name === 'stale-agent-check') return staleAgentCheck();
  if (name === 'telemetry-digest') return telemetryDigest();
  const error = new Error(`Unknown job: ${name}`);
  error.status = 404;
  throw error;
}

module.exports = { runJob, capabilityScan, staleAgentCheck, telemetryDigest };
