const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAgent, RISKS } = require('../lib/agentic');

const base = {
  status: 'Active',
  owner: 'platform',
  scopes: [{ name: 'billing.read', resource: 'billing', effect: 'ALLOW' }],
  stores: [],
  controls: { 'C-001': 'EFFECTIVE', 'C-003': 'EFFECTIVE', 'C-004': 'EFFECTIVE' },
  findings: [],
  events: 2,
  hallucination: null,
  blast: 0,
};

test('OWASP Agentic 2026 covers all ten risks', () => {
  assert.deepEqual(RISKS.map((risk) => risk.id), [
    'ASI01', 'ASI02', 'ASI03', 'ASI04', 'ASI05', 'ASI06', 'ASI07', 'ASI08', 'ASI09', 'ASI10',
  ]);
  const verdicts = validateAgent(base);
  assert.equal(verdicts.find((risk) => risk.id === 'ASI01').state, 'pass');
  assert.equal(verdicts.find((risk) => risk.id === 'ASI04').state, 'not_assessed');
  assert.equal(verdicts.find((risk) => risk.id === 'ASI07').state, 'not_assessed');
  assert.equal(verdicts.find((risk) => risk.id === 'ASI10').state, 'pass');
});

test('goal hijack, excess tools, and rogue controls fail the matching risks', () => {
  const hijacked = validateAgent({
    ...base,
    findings: ['PROMPT_INJECTION', 'MALICIOUS_CODE', 'HALLUCINATION'],
    scopes: [{ name: 'shell.exec', resource: 'shell', effect: 'ALLOW', excess: true }],
    controls: { 'C-003': 'VIOLATED' },
    stores: [{ name: 'kb' }],
    hallucination: 80,
    blast: 20,
    status: 'Active',
  });
  const state = Object.fromEntries(hijacked.map((risk) => [risk.id, risk.state]));
  assert.equal(state.ASI01, 'fail');
  assert.equal(state.ASI02, 'fail');
  assert.equal(state.ASI05, 'fail');
  assert.equal(state.ASI06, 'fail');
  assert.equal(state.ASI08, 'fail');
  assert.equal(state.ASI09, 'fail');
  assert.equal(state.ASI10, 'fail');
});
