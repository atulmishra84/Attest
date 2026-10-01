const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { runJob } = require('../lib/jobs');
const logger = require('../lib/logger');

const router = express.Router();

router.post('/:name', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const result = await runJob(req.params.name);
    res.json({ job: req.params.name, result });
  } catch (err) {
    logger.error({ err: err.message, job: req.params.name }, 'job failed');
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Job failed' });
  }
});

module.exports = router;
