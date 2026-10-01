const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'qyro-assurance' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-api-key"]', 'res.headers["set-cookie"]'],
    remove: true,
  },
});

module.exports = logger;
