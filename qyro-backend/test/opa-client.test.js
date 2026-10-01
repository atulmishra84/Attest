const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate } = require('../lib/opa');

test('assurance evaluation marks a PHI write as violated', async () => {
  const decisions = await evaluate({
    event: { operation: 'PUT', resource: '/patient/123' },
    capability: { scopes: [] },
    controls: [{ id: 'C-001' }, { id: 'C-002' }, { id: 'C-004' }],
  });
  const byId = Object.fromEntries(decisions.map((decision) => [decision.control_id, decision.state]));
  assert.equal(byId['C-001'], 'VIOLATED');
  assert.equal(byId['C-002'], 'VIOLATED');
  assert.equal(byId['C-004'], 'EFFECTIVE');
});
