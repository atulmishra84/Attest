const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../index');

const app = createApp();

test('health reports database connectivity', async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.db, 'connected');
  assert.ok(response.body.redis);
  assert.ok(response.body.opa);
});

test('agent list requires a token and returns a page', async () => {
  const denied = await request(app).get('/api/agents');
  assert.equal(denied.status, 401);

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@qyro.local', password: 'Admin@QYRO123' });
  assert.equal(login.status, 200);

  const agents = await request(app)
    .get('/api/agents')
    .set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(agents.status, 200);
  assert.ok(Array.isArray(agents.body.items));
  assert.equal(typeof agents.body.summary.effective, 'number');
  assert.ok(agents.body.items.every((agent) => !String(agent.id).startsWith('mock-agent-')));

  const violated = await request(app)
    .get('/api/agents?posture=violated')
    .set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(violated.status, 200);
  assert.ok(violated.body.items.every((agent) => agent.controls.violated > 0));

  const alerts = await request(app)
    .get('/api/alerts')
    .set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(alerts.status, 200);
  assert.ok(Array.isArray(alerts.body));

  const events = await request(app)
    .get('/api/telemetry/events?since=24h&q=patient')
    .set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(events.status, 200);
  assert.ok(Array.isArray(events.body.items));

  const evidence = await request(app)
    .get('/api/reports/evidence')
    .set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(evidence.status, 200);
  assert.ok(Array.isArray(evidence.body.controls));

  const threats = await request(app)
    .get('/api/telemetry/threats')
    .set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(threats.status, 200);
  assert.ok(Array.isArray(threats.body));

  const ledger = await request(app)
    .get('/api/telemetry/ledger')
    .set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(ledger.status, 200);
  assert.equal(typeof ledger.body.interceptions.promptInjection.blocked, 'number');
  assert.equal(typeof ledger.body.interceptions.jailbreak.blocked, 'number');
  assert.equal(typeof ledger.body.interceptions.systemPrompt.blocked, 'number');
  assert.ok(Array.isArray(ledger.body.output));
  assert.ok(Array.isArray(ledger.body.volume));

  const privacy = await request(app)
    .get('/api/telemetry/privacy')
    .set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(privacy.status, 200);
  assert.equal(privacy.body.categories.length, 4);
  assert.ok(Array.isArray(privacy.body.oversharing));

  const governance = await request(app)
    .get('/api/reports/governance')
    .set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(governance.status, 200);
  const names = governance.body.frameworks.map((row) => row.framework);
  assert.deepEqual(names, ['EU AI Act', 'ISO/IEC 42001', 'NIST AI RMF']);
  assert.equal(typeof governance.body.spend.estimatedUsd, 'number');
  assert.ok(Array.isArray(governance.body.spend.departments));
  assert.equal(governance.body.agentic.framework, 'OWASP Agentic 2026');
  assert.equal(governance.body.agentic.risks.length, 10);
  assert.equal(governance.body.agentic.risks[0].id, 'ASI01');

  const safety = await request(app)
    .get('/api/telemetry/safety')
    .set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(safety.status, 200);
  assert.equal(typeof safety.body.toxicity.hate, 'number');
  assert.ok(Array.isArray(safety.body.rag));
  assert.equal(safety.body.bias.days.length, 7);

  const ip = await request(app)
    .get('/api/telemetry/ip')
    .set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(ip.status, 200);
  assert.equal(typeof ip.body.counts.copyleft, 'number');

  const ops = await request(app)
    .get('/api/telemetry/ops')
    .set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(ops.status, 200);
  assert.ok(Array.isArray(ops.body.models));
  assert.ok(Array.isArray(ops.body.fallbacks));
});

test('gate blocks a PHI write before it runs', async () => {
  const prisma = require('../lib/prisma');
  const agentId = 'test-gate-agent';
  async function removeFixture() {
    await prisma.threatFinding.deleteMany({ where: { agentId } });
    await prisma.actionDecision.deleteMany({ where: { agentId } });
    await prisma.driftAlert.deleteMany({ where: { agentId } });
    await prisma.capabilitySnapshot.deleteMany({ where: { agentId } });
    await prisma.runtimeEvent.deleteMany({ where: { agentId } });
    await prisma.controlResult.deleteMany({ where: { agentId } });
    await prisma.agentIdentity.deleteMany({ where: { agentId } });
    await prisma.agent.deleteMany({ where: { id: agentId } });
  }
  await removeFixture();
  try {
    const synced = await request(app)
      .post('/api/integration/agentradar/sync')
      .set('X-API-Key', process.env.INTEGRATION_API_KEY)
      .send({
        agents: [{
          id: agentId,
          name: 'Gate fixture',
          source: 'test',
          identity: {
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
        }],
      });
    assert.equal(synced.status, 200);

    const blocked = await request(app)
      .post('/api/decisions')
      .set('X-API-Key', process.env.INTEGRATION_API_KEY)
      .send({ agent_id: agentId, operation: 'PUT', resource: '/patient/123' });
    assert.equal(blocked.status, 200);
    assert.equal(blocked.body.decision, 'block');
    assert.match(blocked.body.reason, /C-001/);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@qyro.local', password: 'Admin@QYRO123' });
    const coverage = await request(app)
      .get('/api/reports/coverage')
      .set('Authorization', `Bearer ${login.body.token}`);
    assert.equal(coverage.status, 200);
    const hipaa = coverage.body.find((row) => row.citation === '164.312(a)(1)');
    assert.ok(hipaa);
    assert.ok(hipaa.violated > 0);

    const blast = await request(app)
      .get('/api/agents/blast')
      .set('Authorization', `Bearer ${login.body.token}`);
    assert.equal(blast.status, 200);
    const fixture = blast.body.find((row) => row.id === agentId);
    assert.ok(fixture);
    assert.ok(fixture.score >= 15);
  } finally {
    await removeFixture();
  }
});

test('auditor cannot publish a framework', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'auditor@qyro.local', password: 'Auditor@QYRO123' });
  const response = await request(app)
    .post('/api/frameworks')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ name: 'Should fail' });
  assert.equal(response.status, 403);
});

test('metrics endpoint is exposed', async () => {
  const response = await request(app).get('/metrics');
  assert.equal(response.status, 200);
  assert.match(response.text, /qyro_http_requests_total/);
});
