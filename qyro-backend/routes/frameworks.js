const crypto = require('crypto');
const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

router.use(requireAuth, requireRole('ADMIN', 'AUDITOR'));

router.get('/', async (req, res) => {
  try {
    const frameworks = await prisma.framework.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        controls: {
          where: { deletedAt: null },
          orderBy: { id: 'asc' },
          select: { id: true, name: true, intentDesc: true, requirementType: true },
        },
      },
    });
    res.json(frameworks.map((framework) => ({
      id: framework.id,
      name: framework.name,
      description: framework.description,
      controls: framework.controls,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list frameworks' });
  }
});

router.post('/', requireRole('ADMIN'), async (req, res) => {
  const { name, description, id } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const framework = await prisma.framework.create({
      data: {
        id: typeof id === 'string' && id.trim() ? id.trim() : newId('FW'),
        name: name.trim(),
        description: description ? String(description) : null,
      },
    });
    res.status(201).json(framework);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create framework' });
  }
});

router.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const { name, description } = req.body || {};
  try {
    const existing = await prisma.framework.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deletedAt) {
      return res.status(404).json({ error: 'Framework not found' });
    }
    const framework = await prisma.framework.update({
      where: { id: existing.id },
      data: {
        ...(typeof name === 'string' ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description: description ? String(description) : null } : {}),
      },
    });
    res.json(framework);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update framework' });
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const existing = await prisma.framework.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deletedAt) {
      return res.status(404).json({ error: 'Framework not found' });
    }
    const now = new Date();
    await prisma.$transaction([
      prisma.framework.update({ where: { id: existing.id }, data: { deletedAt: now } }),
      prisma.control.updateMany({ where: { frameworkId: existing.id, deletedAt: null }, data: { deletedAt: now } }),
    ]);
    res.json({ status: 'deleted', id: existing.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete framework' });
  }
});

router.post('/:id/controls', requireRole('ADMIN'), async (req, res) => {
  const { name, intentDesc, requirementType, id } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  const type = requirementType === 'ALLOW' ? 'ALLOW' : 'DENY';

  try {
    const framework = await prisma.framework.findUnique({ where: { id: req.params.id } });
    if (!framework || framework.deletedAt) {
      return res.status(404).json({ error: 'Framework not found' });
    }
    const control = await prisma.control.create({
      data: {
        id: typeof id === 'string' && id.trim() ? id.trim() : newId('C'),
        frameworkId: framework.id,
        name: name.trim(),
        intentDesc: intentDesc ? String(intentDesc) : null,
        requirementType: type,
      },
    });
    res.status(201).json(control);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create control' });
  }
});

router.get('/:id/policy', async (req, res) => {
  const policy = await prisma.policy.findFirst({
    where: { frameworkId: req.params.id, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
  });
  if (!policy) return res.status(404).json({ error: 'Policy not found' });
  res.json({ id: policy.id, name: policy.name, version: policy.version, rego: policy.rego, updatedAt: policy.updatedAt });
});

router.put('/:id/policy', requireRole('ADMIN'), async (req, res) => {
  const { publishPolicy } = require('../lib/opa');
  const { name, rego } = req.body || {};
  if (!rego || typeof rego !== 'string') return res.status(400).json({ error: 'rego is required' });
  const framework = await prisma.framework.findUnique({ where: { id: req.params.id } });
  if (!framework || framework.deletedAt) return res.status(404).json({ error: 'Framework not found' });
  try {
    await publishPolicy(rego);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const existing = await prisma.policy.findFirst({ where: { frameworkId: framework.id, deletedAt: null } });
  const policy = existing
    ? await prisma.policy.update({
      where: { id: existing.id },
      data: { rego, name: name || existing.name, version: existing.version + 1 },
    })
    : await prisma.policy.create({
      data: { frameworkId: framework.id, name: name || framework.name, rego },
    });
  res.json({ id: policy.id, name: policy.name, version: policy.version });
});

module.exports = router;
