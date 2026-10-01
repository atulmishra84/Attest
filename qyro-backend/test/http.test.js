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
    .get('/api/agents?q=Clinical')
    .set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(agents.status, 200);
  assert.ok(Array.isArray(agents.body.items));
  assert.ok(agents.body.items.some((agent) => agent.name.includes('Clinical')));
  assert.equal(typeof agents.body.summary.effective, 'number');

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
  const phi = evidence.body.controls.find((row) => row.controlId === 'C-001');
  assert.ok(phi);
  assert.ok(phi.citations.some((item) => item.framework === 'HIPAA'));

  const threats = await request(app)
    .get('/api/telemetry/threats')
    .set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(threats.status, 200);
  assert.ok(Array.isArray(threats.body));
});

test('gate blocks a PHI write before it runs', async () => {
  const blocked = await request(app)
    .post('/api/decisions')
    .set('X-API-Key', process.env.INTEGRATION_API_KEY)
    .send({ agent_id: 'mock-agent-001', operation: 'PUT', resource: '/patient/123' });
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
  assert.equal(blast.body[0].id, 'mock-agent-001');
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
