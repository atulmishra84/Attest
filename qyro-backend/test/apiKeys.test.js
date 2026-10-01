const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { hashApiKey, generateApiKey } = require('../lib/apiKeys');

test('hashApiKey is a stable sha256 hex digest', () => {
  const digest = hashApiKey('qyro_test');
  assert.equal(digest, crypto.createHash('sha256').update('qyro_test').digest('hex'));
  assert.equal(digest, hashApiKey('qyro_test'));
  assert.notEqual(digest, hashApiKey('qyro_other'));
});

test('generateApiKey returns a secret that matches its stored hash', () => {
  const first = generateApiKey();
  const second = generateApiKey();
  assert.notEqual(first.secret, second.secret);
  assert.match(first.secret, /^qyro_[a-f0-9]{64}$/);
  assert.equal(first.keyHash, hashApiKey(first.secret));
  assert.equal(first.keyPrefix, first.secret.slice(0, 12));
});
