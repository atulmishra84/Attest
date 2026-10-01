const prisma = require('./prisma');
const { publishPolicy, readBundledPolicy } = require('./opa');
const logger = require('./logger');

async function ensureBundledPolicy() {
  const rego = readBundledPolicy();
  const framework = await prisma.framework.findUnique({ where: { id: 'FW-01' } });
  if (framework && !framework.deletedAt) {
    const existing = await prisma.policy.findFirst({
      where: { frameworkId: framework.id, deletedAt: null },
    });
    if (!existing) {
      await prisma.policy.create({
        data: { frameworkId: framework.id, name: 'Healthcare assurance', rego },
      });
    } else if (existing.version === 1 && existing.name === 'Healthcare assurance' && existing.rego !== rego) {
      await prisma.policy.update({
        where: { id: existing.id },
        data: { rego },
      });
    }
  }
  try {
    const current = await prisma.policy.findFirst({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    await publishPolicy(current?.rego || rego);
  } catch (err) {
    logger.warn({ err: err.message }, 'policy publish skipped');
  }
}

module.exports = { ensureBundledPolicy };
