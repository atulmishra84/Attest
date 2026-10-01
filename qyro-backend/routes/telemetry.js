const express = require('express');
const prisma = require('../lib/prisma');
const { requireApiKey, requireAuth, requireRole } = require('../middleware/auth');
const { evaluateAndStore } = require('../lib/assurance');
const { inspectEvent, recordFindings, ensureThreatScan } = require('../lib/threats');
const logger = require('../lib/logger');

const router = express.Router();

router.get('/threats', requireAuth, requireRole('ADMIN', 'AUDITOR'), async (req, res) => {
  const kind = typeof req.query.kind === 'string' ? req.query.kind : '';
  const agentId = typeof req.query.agentId === 'string' ? req.query.agentId : '';
  try {
    await ensureThreatScan();
    const findings = await prisma.threatFinding.findMany({
      where: {
        ...(kind && kind !== 'all' ? { kind } : {}),
        ...(agentId ? { agentId } : {}),
        agent: { deletedAt: null },
      },
      include: { agent: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(findings.map((finding) => ({
      id: finding.id,
      agentId: finding.agentId,
      agentName: finding.agent.name,
      eventId: finding.eventId,
      kind: finding.kind,
      severity: finding.severity,
      summary: finding.summary,
      evidence: finding.evidence,
      createdAt: finding.createdAt,
    })));
  } catch (err) {
    logger.error({ err: err.message }, 'threat list failed');
    res.status(500).json({ error: 'Failed to list threats' });
  }
});

router.get('/events', requireAuth, requireRole('ADMIN', 'AUDITOR'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const where = { deletedAt: null };
  if (typeof req.query.agentId === 'string' && req.query.agentId) where.agentId = req.query.agentId;
  const windows = { '1h': 60 * 60 * 1000, '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000 };
  const since = windows[req.query.since];
  if (since) where.timestamp = { gte: new Date(Date.now() - since) };
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q) {
    where.OR = [
      { operation: { contains: q, mode: 'insensitive' } },
      { resource: { contains: q, mode: 'insensitive' } },
      { agentId: { contains: q, mode: 'insensitive' } },
    ];
  }
  try {
    const [total, events] = await Promise.all([
      prisma.runtimeEvent.count({ where }),
      prisma.runtimeEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    res.json({
      items: events.map((event) => ({
        id: event.id,
        agent_id: event.agentId,
        event_type: event.eventType,
        operation: event.operation,
        resource: event.resource,
        timestamp: event.timestamp,
      })),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    logger.error({ err: err.message }, 'telemetry list failed');
    res.status(500).json({ error: 'Failed to list telemetry' });
  }
});

router.post('/events', requireApiKey, async (req, res) => {
  const { event } = req.body || {};
  if (!event || !event.agent_id) {
    return res.status(400).json({ error: 'Invalid event: agent_id required' });
  }

  try {
    const agent = await prisma.agent.findUnique({ where: { id: event.agent_id } });
    if (!agent || agent.deletedAt) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const quarantined = agent.status === 'Quarantined';
    const rawPayload = {
      ...(event.raw_payload || {}),
      prompt: event.prompt || event.raw_payload?.prompt || null,
      tool: event.tool || event.raw_payload?.tool || null,
      tool_input: event.tool_input || event.raw_payload?.tool_input || null,
    };
    const created = await prisma.runtimeEvent.create({
      data: {
        agentId: event.agent_id,
        eventType: event.event_type || 'API_CALL',
        operation: event.operation,
        resource: event.resource,
        timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
        rawPayload,
      },
    });

    const identity = await prisma.agentIdentity.findUnique({ where: { agentId: agent.id } });
    const threats = inspectEvent({
      prompt: rawPayload.prompt,
      tool: rawPayload.tool,
      toolInput: rawPayload.tool_input,
      operation: event.operation,
      resource: event.resource,
      capability: identity?.payload,
    });
    if (threats.length) await recordFindings(created.id, agent.id, threats);

    const stored = await evaluateAndStore(event.agent_id, {
      operation: event.operation || '',
      resource: event.resource || '',
      blocked: quarantined || Boolean(event.blocked),
      event_type: event.event_type || 'API_CALL',
    });

    res.json({
      status: quarantined ? 'blocked' : 'success',
      quarantined,
      message: quarantined
        ? 'Agent is quarantined. The call was recorded and blocked.'
        : 'Telemetry ingested and evaluated by Attest',
      threats: threats.map((finding) => finding.kind),
      violations_detected: stored.filter((row) => row.state === 'VIOLATED' || row.state === 'BLOCKED_VIOLATION').length,
      decisions: stored.map((row) => ({ control_id: row.controlId, state: row.state })),
    });
  } catch (err) {
    logger.error({ err: err.message }, 'telemetry ingest failed');
    res.status(err.status || 500).json({ error: 'Failed to process telemetry' });
  }
});

module.exports = router;
