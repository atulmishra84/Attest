const logger = require('./logger');
const { runJob } = require('./jobs');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function startQueue() {
  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  let connection;
  try {
    const { Queue, Worker } = require('bullmq');
    const Redis = require('ioredis');
    connection = new Redis(url, {
      maxRetriesPerRequest: null,
      connectTimeout: 1000,
      retryStrategy: () => null,
    });
    connection.on('error', () => {});
    await connection.ping();
    const queue = new Queue('qyro-drift', { connection });
    await queue.upsertJobScheduler('capability-scan', { every: HOUR }, { name: 'capability-scan' });
    await queue.upsertJobScheduler('telemetry-digest', { every: DAY }, { name: 'telemetry-digest' });
    await queue.upsertJobScheduler('stale-agent-check', { every: DAY }, { name: 'stale-agent-check' });
    const worker = new Worker('qyro-drift', async (job) => runJob(job.name), { connection });
    worker.on('failed', (job, err) => logger.error({ job: job?.name, err: err.message }, 'drift job failed'));
    logger.info({ url }, 'drift queue connected');
    return { mode: 'bullmq', queue, worker };
  } catch (err) {
    if (connection) connection.disconnect();
    logger.warn({ err: err.message }, 'Redis unavailable; drift jobs stay on manual trigger');
    return { mode: 'manual' };
  }
}

module.exports = { startQueue };
