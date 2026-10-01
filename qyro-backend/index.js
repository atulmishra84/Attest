require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { requireHttps } = require('./middleware/auth');
const { ensureBootstrapApiKey } = require('./lib/apiKeys');
const { ensureBundledPolicy } = require('./lib/policies');
const { startQueue } = require('./lib/queue');
const { healthReport } = require('./lib/health');
const { register } = require('./lib/metrics');
const { startSpan } = require('./lib/tracing');
const { observeRequest } = require('./lib/metrics');
const logger = require('./lib/logger');
const authRoutes = require('./routes/auth');
const agentRoutes = require('./routes/agents');
const telemetryRoutes = require('./routes/telemetry');
const apiKeyRoutes = require('./routes/apiKeys');
const frameworkRoutes = require('./routes/frameworks');
const jobRoutes = require('./routes/jobs');
const alertRoutes = require('./routes/alerts');
const decisionRoutes = require('./routes/decisions');
const streamRoutes = require('./routes/stream');
const reportRoutes = require('./routes/reports');

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(requireHttps);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 300),
    standardHeaders: true,
    legacyHeaders: false,
  }));
  app.use((req, res, next) => {
    if (req.path === '/metrics') return next();
    const span = startSpan(`${req.method} ${req.path}`);
    req.traceId = span.traceId;
    res.setHeader('x-trace-id', span.traceId);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      observeRequest(req.method, req.path, String(res.statusCode), seconds);
      span.end(res.statusCode);
      logger.info({ traceId: span.traceId, method: req.method, path: req.path, status: res.statusCode }, 'request');
    });
    next();
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/agents', agentRoutes);
  app.use('/api/integration/agentradar', agentRoutes);
  app.use('/api/telemetry', telemetryRoutes);
  app.use('/api/api-keys', apiKeyRoutes);
  app.use('/api/frameworks', frameworkRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/alerts', alertRoutes);
  app.use('/api/decisions', decisionRoutes);
  app.use('/api/stream', streamRoutes);
  app.use('/api/reports', reportRoutes);

  app.get('/api/health', async (req, res) => {
    const report = await healthReport();
    res.status(report.db === 'connected' ? 200 : 503).json(report);
  });

  app.get('/metrics', async (req, res) => {
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
  });

  app.use((err, req, res, next) => {
    logger.error({ err: err.message, traceId: req.traceId }, 'unhandled error');
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

async function start() {
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.JWT_SECRET || '';
    if (!secret || secret.includes('change')) {
      throw new Error('JWT_SECRET must be set to a production value');
    }
  }
  const port = process.env.PORT || 3000;
  const app = createApp();
  app.listen(port, async () => {
    try {
      await ensureBootstrapApiKey();
      await ensureBundledPolicy();
      await startQueue();
    } catch (err) {
      logger.error({ err: err.message }, 'startup task failed');
    }
    logger.info({ port }, 'Attest assurance engine listening');
  });
}

if (require.main === module) {
  start().catch((err) => {
    logger.error({ err: err.message }, 'server failed to start');
    process.exit(1);
  });
}

module.exports = { createApp, start };
