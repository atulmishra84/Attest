require('dotenv').config();
const prisma = require('./lib/prisma');
const bcrypt = require('bcryptjs');

async function seed() {
  console.log('Seeding the Attest database via Prisma...');

  // ── Framework & Controls ─────────────────────────────────────────────────
  const framework = await prisma.framework.upsert({
    where: { id: 'FW-01' },
    update: {},
    create: {
      id: 'FW-01',
      name: 'Healthcare AI Safety Standard',
      description: 'Core controls for healthcare AI agents',
    },
  });

  const controls = [
    { id: 'C-001', name: 'No PHI Access', intentDesc: 'Agent must not read protected health information', requirementType: 'DENY' },
    { id: 'C-002', name: 'No Database Write', intentDesc: 'Agent must not write to any production database', requirementType: 'DENY' },
    { id: 'C-003', name: 'Approved APIs Only', intentDesc: 'Agent must only call safelisted APIs', requirementType: 'ALLOW' },
    { id: 'C-004', name: 'No Destructive Ops', intentDesc: 'Agent must not perform DELETE or DROP operations', requirementType: 'DENY' },
  ];

  for (const c of controls) {
    await prisma.control.upsert({
      where: { id: c.id },
      update: {},
      create: { ...c, frameworkId: 'FW-01' },
    });
  }

  // ── Default Admin User ────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin@QYRO123', 12);
  await prisma.user.upsert({
    where: { email: 'admin@qyro.local' },
    update: { name: 'Attest Admin' },
    create: {
      email: 'admin@qyro.local',
      passwordHash,
      name: 'Attest Admin',
      role: 'ADMIN',
    },
  });

  const auditorHash = await bcrypt.hash('Auditor@QYRO123', 12);
  await prisma.user.upsert({
    where: { email: 'auditor@qyro.local' },
    update: { name: 'Attest Auditor' },
    create: {
      email: 'auditor@qyro.local',
      passwordHash: auditorHash,
      name: 'Attest Auditor',
      role: 'AUDITOR',
    },
  });

  const identities = [
    {
      agentId: 'mock-agent-001',
      name: 'Clinical Document Analyzer',
      provider: 'aws',
      payload: {
        credential: 'svc-clinical',
        principal: 'arn:aws:iam::100:role/clinical-docs',
        scopes: [
          { name: 'patient.read', resource: 'patient', effect: 'ALLOW' },
          { name: 'patient.update', resource: 'patient', effect: 'ALLOW', excess: true },
        ],
      },
    },
    {
      agentId: 'mock-agent-002',
      name: 'Billing Support Bot',
      provider: 'gcp',
      payload: {
        credential: 'billing-sa',
        principal: 'billing-bot@project.iam.gserviceaccount.com',
        scopes: [{ name: 'billing.read', resource: 'billing', effect: 'ALLOW' }],
      },
    },
    {
      agentId: 'mock-agent-003',
      name: 'Patient Scheduling Assistant',
      provider: 'azure',
      payload: {
        credential: 'schedule-mi',
        principal: 'patient-scheduling',
        scopes: [{ name: 'schedule.read', resource: 'schedule', effect: 'ALLOW' }],
      },
    },
  ];
  for (const identity of identities) {
    await prisma.agent.upsert({
      where: { id: identity.agentId },
      update: {},
      create: {
        id: identity.agentId,
        name: identity.name,
        discoverySource: 'External AgentRadar Engine',
        status: 'Active',
      },
    });
    await prisma.agentIdentity.upsert({
      where: { agentId: identity.agentId },
      update: { provider: identity.provider, payload: identity.payload },
      create: {
        agentId: identity.agentId,
        provider: identity.provider,
        payload: identity.payload,
      },
    });
  }

  console.log('✅ Seeded: Framework FW-01, 4 Controls, admin + auditor');
  console.log('   Admin:   admin@qyro.local    /  Admin@QYRO123');
  console.log('   Auditor: auditor@qyro.local  /  Auditor@QYRO123');
}

seed()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
