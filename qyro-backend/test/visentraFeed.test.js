const test = require('node:test');
const assert = require('node:assert/strict');
const { mapVisentraAgent } = require('../lib/visentraFeed');

test('a Visentra Bedrock agent becomes an Attest identity', () => {
  const mapped = mapVisentraAgent({
    id: '99769328-903c-4d2d-a74a-7e70e5cbcb85',
    name: 'gie-orchestrator-dev (AI)',
    cloud_provider: 'aws',
    framework: 'BedrockAgent',
    fingerprint: 'aws-agent:128759047507:UVAEVIZWTC',
    owner: 'platform',
    department: 'Clinical',
    running_status: 'running',
    model: 'anthropic.claude-3-haiku-20240307-v1:0',
    howIdentified: 'aws-api-live',
    region: 'us-east-1',
    endpoint: 'arn:aws:bedrock:us-east-1:128759047507:agent/UVAEVIZWTC',
    agentStatus: 'confirmed',
    tools: [
      { name: 'analyze_workflow', risk_flags: { can_modify_state: false } },
      { name: 'cancel_workflow', risk_flags: { can_modify_state: true } },
    ],
  });
  assert.equal(mapped.source, 'Visentra');
  assert.equal(mapped.identity.provider, 'aws');
  assert.equal(mapped.identity.payload.principal, 'aws-agent:128759047507:UVAEVIZWTC');
  assert.equal(mapped.identity.payload.scopes[1].excess, true);
  assert.equal(mapped.owner, 'platform');
  assert.equal(mapped.identity.payload.department, 'Clinical');
  assert.equal(mapped.model, 'anthropic.claude-3-haiku-20240307-v1:0');
  assert.equal(mapped.discoveredHow, 'aws-api-live');
  assert.match(mapped.identifiedWhere, /AWS · us-east-1/);
  assert.equal(mapped.discoveryStatus, 'confirmed');
});
