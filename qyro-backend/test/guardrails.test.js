const test = require('node:test');
const assert = require('node:assert/strict');
const { assessSafety, hallucinationIndex, SAFETY_BLOCKING } = require('../lib/safety');
const { inspectIp, proximityScore, IP_BLOCKING } = require('../lib/ip');
const { assessOps, driftOf } = require('../lib/ops');

const SOURCE = 'The refund window is thirty days from the invoice date. Returns need the original receipt and the order number printed on the packing slip.';

test('hate and harassment flags are blocking safety findings', () => {
  const hate = assessSafety({ output: 'completion', flags: ['hate'] });
  assert.ok(hate.findings.some((finding) => finding.kind === 'HATE_SPEECH'));
  assert.ok(SAFETY_BLOCKING.has('HATE_SPEECH'));
  const abuse = assessSafety({ output: 'completion', safety_scores: { harassment: 0.91 } });
  assert.ok(abuse.findings.some((finding) => finding.kind === 'HARASSMENT'));
  const clean = assessSafety({ output: 'The refund window is thirty days.' });
  assert.equal(clean.findings.length, 0);
});

test('hallucination index rises when the answer leaves the source', () => {
  const grounded = hallucinationIndex({ output: SOURCE, sources: [SOURCE] });
  assert.ok(grounded != null && grounded < 20);
  const invented = hallucinationIndex({
    output: 'Customers may return goods for five years and receive triple cash back without a receipt.',
    sources: [SOURCE],
  });
  assert.ok(invented >= 60);
  const alert = assessSafety({
    output: 'Customers may return goods for five years and receive triple cash back without a receipt.',
    sources: [SOURCE],
  });
  assert.ok(alert.findings.some((finding) => finding.kind === 'HALLUCINATION'));
  assert.equal(SAFETY_BLOCKING.has('HALLUCINATION'), false);
});

test('bias alerts use a supplied score and do not invent a demographic', () => {
  const named = assessSafety({ output: 'Approved.', bias_score: 0.2, demographic: 'Jane Doe' });
  assert.equal(named.metrics.biasAttribute, '');
  assert.equal(named.findings.some((finding) => finding.kind === 'BIAS_ALERT'), false);
  const hiring = assessSafety({ output: 'Rejected.', bias_score: 0.82, bias_attribute: 'age_band', workflow: 'hr hiring' });
  assert.equal(hiring.metrics.workflow, 'HR');
  assert.equal(hiring.metrics.biasAttribute, 'age_band');
  assert.ok(hiring.findings.some((finding) => finding.kind === 'BIAS_ALERT'));
});

test('copyleft notices and close paraphrases are blocking IP findings', () => {
  const license = inspectIp({ output: '/* SPDX-License-Identifier: GPL-3.0-only */\nfunction run() { return 1; }' });
  assert.ok(license.some((finding) => finding.kind === 'COPYLEFT_LICENSE'));
  assert.ok(IP_BLOCKING.has('COPYLEFT_LICENSE'));
  const reference = 'The quick brown fox jumps over the lazy dog near the river bank every single morning before sunrise.';
  const close = `${reference} Extra clause.`;
  const score = proximityScore(close, reference);
  assert.ok(score >= 55);
  const finding = inspectIp({ output: close, reference });
  const proximity = finding.find((item) => item.kind === 'COPYRIGHT_PROXIMITY');
  assert.ok(proximity);
  assert.equal(proximity.evidence.includes('fox jumps'), false);
  const mark = inspectIp({ output: 'Powered by Northwind.', trademarks: ['Northwind'] });
  assert.ok(mark.some((item) => item.kind === 'TRADEMARK'));
  assert.equal(inspectIp({ output: 'We should avoid GPL when we can.' }).length, 0);
});

test('latency, drift, and fallback routing are measured from call metrics', () => {
  const slow = assessOps({ model: 'gpt-4o', latency_ms: 5200, ttft_ms: 1800, primary_model: 'gpt-4o', routed_to: 'claude-3-haiku' });
  assert.ok(slow.findings.some((finding) => finding.kind === 'LATENCY_HIGH'));
  assert.equal(slow.metrics.routedTo, 'claude-3-haiku');
  assert.equal(driftOf([70, 72, 68], [90, 88, 91]).degraded, true);
  assert.equal(driftOf([90], [91, 90, 89]), null);
});
