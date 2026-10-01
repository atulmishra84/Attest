const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generateApiKey } = require('../lib/apiKeys');

const router = express.Router();

router.use(requireAuth, requireRole('ADMIN', 'AUDITOR'));

router.get('/', async (req, res) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        role: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    res.json(keys);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

router.post('/', requireRole('ADMIN'), async (req, res) => {
  const { name, expiresInDays } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }

  const days = Number(expiresInDays);
  const expiresAt = Number.isFinite(days) && days > 0
    ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    : null;

  try {
    const generated = generateApiKey();
    const record = await prisma.apiKey.create({
      data: {
        name: name.trim(),
        keyHash: generated.keyHash,
        keyPrefix: generated.keyPrefix,
        role: 'INTEGRATION',
        expiresAt,
      },
    });

    res.status(201).json({
      id: record.id,
      name: record.name,
      keyPrefix: record.keyPrefix,
      role: record.role,
      expiresAt: record.expiresAt,
      secret: generated.secret,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const existing = await prisma.apiKey.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deletedAt) {
      return res.status(404).json({ error: 'API key not found' });
    }
    await prisma.apiKey.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    res.json({ status: 'revoked', id: existing.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

module.exports = router;
