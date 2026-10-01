const express = require('express');
const { requireApiKey, requireAuth, requireRole } = require('../middleware/auth');
const { agentsFromFeed } = require('../lib/visentraFeed');
const { ingestAgents } = require('../lib/discoveryIngest');
const { feedStatus } = require('../lib/visentraLive');
const logger = require('../lib/logger');

const router = express.Router();

router.get('/status', requireAuth, requireRole('ADMIN', 'AUDITOR'), (req, res) => {
  res.json(feedStatus());
});

router.post('/feed', requireApiKey, async (req, res) => {
  const agents = agentsFromFeed(req.body || {});
  if (!agents.length) {
    return res.status(400).json({ error: 'Visentra feed did not include any agents' });
  }
  try {
    const result = await ingestAgents(agents);
    res.json({ status: 'success', ...result, message: `Synced ${result.synced} Visentra agents into Attest.` });
  } catch (err) {
    logger.error({ err: err.message }, 'visentra feed ingest failed');
    res.status(500).json({ error: 'Failed to ingest Visentra feed' });
  }
});

module.exports = router;
