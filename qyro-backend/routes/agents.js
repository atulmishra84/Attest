const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole, requireApiKey } = require('../middleware/auth');
const { latestCapability, refreshCapability } = require('../lib/assurance');
const { ensureThreatScan } = require('../lib/threats');
const { emitAlert } = require('../lib/alerts');
const { scoreBlast } = require('../lib/blast');

const router = express.Router();

function latestCounts(controlResults) {
  const latest = new Map();
  for (const result of controlResults) {
    const current = latest.get(result.controlId);
    if (!current || new Date(result.evaluatedAt) > new Date(current.evaluatedAt)) {
      latest.set(result.controlId, result);
    }
  }
  const counts = { effective: 0, ineffective: 0, violated: 0, unknown: 0, notTested: 0 };
  latest.forEach((result) => {
    if (result.state === 'EFFECTIVE') counts.effective += 1;
    else if (result.state === 'INEFFECTIVE') counts.ineffective += 1;
    else if (result.state === 'VIOLATED' || result.state === 'BLOCKED_VIOLATION') counts.violated += 1;
    else if (result.state === 'NOT_TESTED') counts.notTested += 1;
    else counts.unknown += 1;
  });
  const evaluatedAt = [...latest.values()].reduce((latestAt, result) => {
    const at = new Date(result.evaluatedAt);
    return !latestAt || at > latestAt ? at : latestAt;
  }, null);
  return { counts, evaluatedAt };
}

function matchesPosture(agent, posture) {
  if (!posture || posture === 'all') return true;
  if (posture === 'stale') return agent.status === 'Stale';
  if (posture === 'quarantined') return agent.status === 'Quarantined';
  const controls = agent.controls;
  if (posture === 'violated') return controls.violated > 0;
  if (posture === 'ineffective') return controls.ineffective > 0;
  if (posture === 'unknown') {
    return controls.unknown > 0 || controls.notTested > 0
      || controls.effective + controls.ineffective + controls.violated + controls.unknown + controls.notTested === 0;
  }
  if (posture === 'effective') {
    return controls.effective > 0
      && controls.violated === 0
      && controls.ineffective === 0
      && controls.unknown === 0
      && controls.notTested === 0;
  }
  return true;
}

/**
 * GET /api/agents
 * Returns agents with live control summary counts.
 * Query: q, page, pageSize, posture, provider.
 * Requires: ADMIN or AUDITOR role.
 */
router.get('/', requireAuth, requireRole('ADMIN', 'AUDITOR'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const posture = typeof req.query.posture === 'string' ? req.query.posture : 'all';
  const provider = typeof req.query.provider === 'string' ? req.query.provider.trim().toLowerCase() : '';
  const where = {
    deletedAt: null,
    ...(q ? {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { discoverySource: { contains: q, mode: 'insensitive' } },
      ],
    } : {}),
    ...(provider && provider !== 'all' ? { identity: { is: { provider } } } : {}),
  };
  try {
    const agents = await prisma.agent.findMany({
      where,
      include: {
        identity: { select: { provider: true } },
        controlResults: {
          where: { deletedAt: null },
          select: { controlId: true, state: true, evaluatedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = agents.map((agent) => {
      const { counts, evaluatedAt } = latestCounts(agent.controlResults);
      return {
        id: agent.id,
        name: agent.name,
        source: agent.discoverySource,
        status: agent.status,
        provider: agent.identity?.provider || 'custom',
        controls: counts,
        lastEvaluated: evaluatedAt || agent.updatedAt,
      };
    }).filter((agent) => matchesPosture(agent, posture));

    const summary = mapped.reduce((sum, agent) => ({
      agents: sum.agents + 1,
      stale: sum.stale + (agent.status === 'Stale' ? 1 : 0),
      effective: sum.effective + agent.controls.effective,
      ineffective: sum.ineffective + agent.controls.ineffective,
      violated: sum.violated + agent.controls.violated,
      unknown: sum.unknown + agent.controls.unknown,
      notTested: sum.notTested + agent.controls.notTested,
    }), { agents: 0, stale: 0, effective: 0, ineffective: 0, violated: 0, unknown: 0, notTested: 0 });

    const total = mapped.length;
    const items = mapped.slice((page - 1) * pageSize, page * pageSize);
    res.json({ items, total, page, pageSize, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

router.get('/blast', requireAuth, requireRole('ADMIN', 'AUDITOR'), async (req, res) => {
  try {
    const agents = await prisma.agent.findMany({
      where: { deletedAt: null },
      include: { identity: true },
    });
    const ranked = agents.map((agent) => {
      const blast = scoreBlast(agent.identity?.payload, agent.owner);
      return {
        id: agent.id,
        name: agent.name,
        provider: agent.identity?.provider || 'custom',
        owner: agent.owner,
        score: blast.score,
        reasons: blast.reasons,
      };
    }).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
    res.json(ranked);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to rank blast radius' });
  }
});

/**
 * GET /api/agents/:id/assurance
 * Returns full assurance results for a specific agent.
 * Requires: ADMIN or AUDITOR role.
 */
router.get('/:id/assurance', requireAuth, requireRole('ADMIN', 'AUDITOR'), async (req, res) => {
  try {
    const { id } = req.params;
    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent || agent.deletedAt) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const [results, events] = await Promise.all([
      prisma.controlResult.findMany({
        where: { agentId: id, deletedAt: null },
        include: { control: { select: { name: true, requirementType: true } } },
        orderBy: { evaluatedAt: 'desc' },
      }),
      prisma.runtimeEvent.findMany({
        where: { agentId: id, deletedAt: null },
        orderBy: { timestamp: 'desc' },
        take: 20,
      }),
    ]);
    const capability = await latestCapability(id);
    await ensureThreatScan();
    const [threats, gate] = await Promise.all([
      prisma.threatFinding.findMany({
        where: { agentId: id },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
      prisma.actionDecision.findFirst({
        where: { agentId: id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const latestByControl = new Map();
    for (const result of results) {
      if (!latestByControl.has(result.controlId)) latestByControl.set(result.controlId, result);
    }

    const latestEvent = events[0];
    const call = latestEvent
      ? [latestEvent.operation, latestEvent.resource].filter(Boolean).join(' ')
      : '';
    const control_results = [...latestByControl.values()].map((r) => {
      const message = r.evidencePayload?.message || 'No evidence recorded.';
      const finding = r.state === 'EFFECTIVE' || !call ? message : `${message} · Last call ${call}`;
      return {
        control_id: r.controlId,
        name: r.control.name,
        state: r.state,
        description: finding,
        evaluatedAt: r.evaluatedAt,
      };
    });

    res.json({
      agent_id: agent.id,
      name: agent.name,
      source: agent.discoverySource,
      status: agent.status,
      control_results,
      capability,
      gate: gate ? {
        id: gate.id,
        decision: gate.decision,
        operation: gate.operation,
        resource: gate.resource,
        tool: gate.tool,
        reason: gate.reason,
        controls: gate.controls,
        createdAt: gate.createdAt,
      } : null,
      threats: threats.map((finding) => ({
        id: finding.id,
        kind: finding.kind,
        severity: finding.severity,
        summary: finding.summary,
        evidence: finding.evidence,
        createdAt: finding.createdAt,
      })),
      runtime_events: events.map((event) => ({
        id: event.id,
        event_type: event.eventType,
        operation: event.operation,
        resource: event.resource,
        timestamp: event.timestamp,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch assurance results' });
  }
});

router.post('/:id/quarantine', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const release = req.body?.action === 'release';
  try {
    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent || agent.deletedAt) return res.status(404).json({ error: 'Agent not found' });
    const status = release ? 'Active' : 'Quarantined';
    await prisma.agent.update({ where: { id: agent.id }, data: { status } });
    const message = release
      ? `${agent.name} released from quarantine`
      : `${agent.name} quarantined. Further calls are blocked.`;
    await prisma.driftAlert.create({
      data: { agentId: agent.id, toState: release ? 'EFFECTIVE' : 'BLOCKED_VIOLATION', message },
    });
    await emitAlert({ agentId: agent.id, toState: release ? 'EFFECTIVE' : 'BLOCKED_VIOLATION', message });
    res.json({ id: agent.id, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update quarantine' });
  }
});

router.post('/:id/capability/refresh', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const graph = await refreshCapability(req.params.id);
  if (!graph) return res.status(404).json({ error: 'Agent not found' });
  res.json(graph);
});

/**
 * POST /api/integration/agentradar/sync
 * Webhook for external AgentRadar tool to push discovered agents.
 * Requires: X-API-Key header (machine-to-machine, no JWT needed)
 */
router.post('/sync', requireApiKey, async (req, res) => {
  const { agents } = req.body;
  if (!agents || !Array.isArray(agents)) {
    return res.status(400).json({ error: 'Invalid payload: agents array required' });
  }

  try {
    const upserts = agents.map((a) =>
      prisma.agent.upsert({
        where: { id: a.id },
        update: {
          name: a.name,
          discoverySource: a.source,
          status: a.status || 'Active',
          deletedAt: null,
          ...(a.owner ? { owner: a.owner } : {}),
        },
        create: { id: a.id, name: a.name, discoverySource: a.source, status: a.status || 'Active', owner: a.owner || null },
      })
    );
    await prisma.$transaction(upserts);
    for (const agent of agents) {
      if (!agent.identity || !agent.identity.provider) continue;
      await prisma.agentIdentity.upsert({
        where: { agentId: agent.id },
        update: { provider: agent.identity.provider, payload: agent.identity.payload || {} },
        create: { agentId: agent.id, provider: agent.identity.provider, payload: agent.identity.payload || {} },
      });
    }
    res.json({ status: 'success', message: `Synced ${agents.length} agents into Attest.` });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Failed to sync agents' });
  }
});

module.exports = router;
