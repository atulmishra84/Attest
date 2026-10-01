const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveCapability } = require('../lib/capability/resolve');

test('capability resolver builds a chain from a stored identity', () => {
  const graph = resolveCapability(
    { name: 'Clinical Document Analyzer' },
    {
      provider: 'aws',
      payload: {
        credential: 'svc-clinical',
        principal: 'arn:aws:iam::100:role/clinical-docs',
        scopes: [
          { name: 'patient.read', effect: 'ALLOW' },
          { name: 'patient.update', effect: 'ALLOW', excess: true },
        ],
      },
    },
  );

  assert.equal(graph.provider, 'aws');
  assert.equal(graph.source, 'aws-document');
  assert.equal(graph.nodes[0].data.label, 'Clinical Document Analyzer');
  assert.equal(graph.nodes.at(-1).data.label, 'patient.update (EXCESS)');
  assert.equal(graph.edges.length, 4);
});
