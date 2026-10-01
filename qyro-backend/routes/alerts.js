const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const logger = require('../lib/logger');

const router = express.Router();

router.get('/', requireAuth, requireRole('ADMIN', 'AUDITOR'), async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 8));
  try {
    const alerts = await prisma.driftAlert.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { agent: { select: { name: true, deletedAt: true } } },
    });
    res.json(alerts
      .filter((alert) => alert.agent && !alert.agent.deletedAt)
      .map((alert) => ({
        id: alert.id,
        agentId: alert.agentId,
        agentName: alert.agent.name,
        controlId: alert.controlId,
        fromState: alert.fromState,
        toState: alert.toState,
        message: alert.message,
        createdAt: alert.createdAt,
      })));
  } catch (err) {
    logger.error({ err: err.message }, 'alert list failed');
    res.status(500).json({ error: 'Failed to list drift alerts' });
  }
});

module.exports = router;
