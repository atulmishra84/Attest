const crypto = require('crypto');
const prisma = require('./prisma');

function hashApiKey(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function generateApiKey() {
  const secret = `qyro_${crypto.randomBytes(32).toString('hex')}`;
  return {
    secret,
    keyHash: hashApiKey(secret),
    keyPrefix: secret.slice(0, 12),
  };
}

async function ensureBootstrapApiKey() {
  const raw = process.env.INTEGRATION_API_KEY;
  if (!raw) return null;

  const keyHash = hashApiKey(raw);
  return prisma.apiKey.upsert({
    where: { keyHash },
    update: { deletedAt: null },
    create: {
      name: 'bootstrap-integration',
      keyHash,
      keyPrefix: raw.slice(0, 12),
      role: 'INTEGRATION',
    },
  });
}

module.exports = { hashApiKey, generateApiKey, ensureBootstrapApiKey };
