const prisma = require('./prisma');

async function ingestAgents(agents) {
  const rows = (agents || []).filter((agent) => agent && agent.id && agent.name);
  if (!rows.length) return { synced: 0 };
  const existing = await prisma.agent.findMany({
    where: { id: { in: rows.map((agent) => agent.id) } },
    select: { id: true, status: true },
  });
  const statusById = new Map(existing.map((agent) => [agent.id, agent.status]));

  await prisma.$transaction(rows.map((agent) => {
    const current = statusById.get(agent.id);
    const status = current === 'Quarantined' ? 'Quarantined' : (agent.status || 'Active');
    return prisma.agent.upsert({
      where: { id: agent.id },
      update: {
        name: agent.name,
        discoverySource: agent.source || 'Visentra',
        status,
        deletedAt: null,
        ...(agent.owner ? { owner: agent.owner } : {}),
        ...(agent.model !== undefined ? { model: agent.model || null } : {}),
        ...(agent.discoveredHow !== undefined ? { discoveredHow: agent.discoveredHow || null } : {}),
        ...(agent.identifiedWhere !== undefined ? { identifiedWhere: agent.identifiedWhere || null } : {}),
        ...(agent.discoveryStatus !== undefined ? { discoveryStatus: agent.discoveryStatus || null } : {}),
      },
      create: {
        id: agent.id,
        name: agent.name,
        discoverySource: agent.source || 'Visentra',
        status,
        owner: agent.owner || null,
        model: agent.model || null,
        discoveredHow: agent.discoveredHow || null,
        identifiedWhere: agent.identifiedWhere || null,
        discoveryStatus: agent.discoveryStatus || null,
      },
    });
  }));

  for (const agent of rows) {
    if (!agent.identity || !agent.identity.provider) continue;
    await prisma.agentIdentity.upsert({
      where: { agentId: agent.id },
      update: { provider: agent.identity.provider, payload: agent.identity.payload || {} },
      create: {
        agentId: agent.id,
        provider: agent.identity.provider,
        payload: agent.identity.payload || {},
      },
    });
  }
  return { synced: rows.length };
}

module.exports = { ingestAgents };
