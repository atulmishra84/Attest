const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreBlast } = require('../lib/blast');

test('excess sensitive scope outranks a scoped billing agent', () => {
  const clinical = scoreBlast({
    scopes: [
      { name: 'patient.read', resource: 'patient', effect: 'ALLOW' },
      { name: 'patient.update', resource: 'patient', effect: 'ALLOW', excess: true },
    ],
  }, null);
  const billing = scoreBlast({
    scopes: [{ name: 'billing.read', resource: 'billing', effect: 'ALLOW' }],
  }, 'finance-owner');
  assert.ok(clinical.score > billing.score);
  assert.ok(clinical.reasons.some((reason) => reason.includes('excess')));
  assert.ok(clinical.reasons.some((reason) => reason.includes('No owner')));
});
