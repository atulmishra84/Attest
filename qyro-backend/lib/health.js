const prisma = require('./prisma');

async function checkRedis() {
  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const Redis = require('ioredis');
  const client = new Redis(url, {
    connectTimeout: 500,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    retryStrategy: () => null,
  });
  client.on('error', () => {});
  try {
    await client.connect();
    const pong = await client.ping();
    return pong === 'PONG' ? 'connected' : 'disconnected';
  } catch {
    return 'disconnected';
  } finally {
    client.disconnect();
  }
}

async function checkOpa() {
  const base = process.env.OPA_URL || 'http://127.0.0.1:8181';
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(800) });
    return response.ok ? 'connected' : 'disconnected';
  } catch {
    return 'disconnected';
  }
}

async function healthReport() {
  const checks = { db: 'disconnected', redis: 'disconnected', opa: 'disconnected' };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = 'connected';
  } catch {
    checks.db = 'disconnected';
  }
  checks.redis = await checkRedis();
  checks.opa = await checkOpa();
  const ok = checks.db === 'connected';
  return {
    status: ok ? 'ok' : 'degraded',
    service: 'Attest Assurance Engine',
    ...checks,
  };
}

module.exports = { healthReport };
