const test = require('node:test');
const assert = require('node:assert/strict');
const { redactText, oversharingReasons } = require('../lib/dlp');

test('the proxy masks names, SSNs, source code, and financial credentials', () => {
  const masked = redactText([
    'Name: Jane Doe',
    'SSN 123-45-6789',
    'function exportReport() { return 1 }',
    'api_key=sk-test-secret',
    '4111111111111111',
  ].join('\n'));
  assert.equal(masked.counts.name, 1);
  assert.equal(masked.counts.ssn, 1);
  assert.ok(masked.counts.source_code >= 1);
  assert.ok(masked.counts.financial >= 2);
  assert.equal(masked.text.includes('123-45-6789'), false);
  assert.equal(masked.text.includes('Jane Doe'), false);
  assert.equal(masked.text.includes('sk-test-secret'), false);
});

test('a knowledge store without an owner is an oversharing flag', () => {
  const posture = oversharingReasons({
    owner: null,
    identity: {
      payload: {
        dataClasses: ['phi'],
        stores: [{ name: 'clinical-index', kind: 'knowledge' }],
        scopes: [],
      },
    },
  });
  assert.ok(posture.reasons.some((reason) => /no owner/i.test(reason)));
});
