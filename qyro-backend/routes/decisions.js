const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole, requireApiKey } = require('../middleware/auth');
const { decide } = require('../lib/gate');
const logger = require('../lib/logger');

const router = express.Router();

router.get('/', requireAuth, requireRole('ADMIN', 'AUDITOR'), async (req, res) => {
  const agentId = typeof req.query.agentId === 'string' ? req.query.agentId : '';
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  try {
    const rows = await prisma.actionDecision.findMany({
      where: agentId ? { agentId } : {},
      include: { agent: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json(rows.map((row) => ({
      id: row.id,
      agentId: row.agentId,
      agentName: row.agent.name,
      operation: row.operation,
      resource: row.resource,
      tool: row.tool,
      decision: row.decision,
      reason: row.reason,
      controls: row.controls,
      createdAt: row.createdAt,
    })));
  } catch (err) {
    logger.error({ err: err.message }, 'decision list failed');
    res.status(500).json({ error: 'Failed to list decisions' });
  }
});

router.post('/', requireApiKey, async (req, res) => {
  const body = req.body || {};
  const agentId = body.agent_id || body.agentId;
  if (!agentId) return res.status(400).json({ decision: 'block', error: 'agent_id required' });
  try {
    const result = await decide(agentId, body);
    res.json(result);
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ decision: 'block', reason: err.message });
    }
    logger.error({ err: err.message }, 'gate decision failed');
    res.status(500).json({ decision: 'block', error: 'Failed to decide' });
  }
});

module.exports = router;
