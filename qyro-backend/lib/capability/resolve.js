const styles = {
  neutral: { background: '#eaeef8', border: '1px solid #d7dced', borderRadius: '8px' },
  focus: { background: '#e2e8ff', border: '1px solid #3457d5', color: '#3457d5', fontWeight: 'bold', borderRadius: '8px' },
  allow: { background: '#e1f3ec', border: '1px solid #0f7a5c', color: '#0f7a5c', borderRadius: '8px' },
  deny: { background: '#fbe4e4', border: '1px solid #b8272c', color: '#b8272c', borderRadius: '8px' },
};

const providerLabel = {
  aws: 'AWS IAM Role',
  gcp: 'GCP Service Account',
  azure: 'Azure Managed Identity',
  custom: 'Identity Principal',
};

function resolveCapability(agent, identity) {
  const provider = identity?.provider || 'custom';
  const payload = identity?.payload || {};
  const nodes = [];
  const edges = [];

  function add(id, label, tone, y) {
    nodes.push({
      id,
      position: { x: nodes.length * 190, y },
      data: { label },
      style: styles[tone] || styles.neutral,
    });
  }

  add('agent', agent.name || 'Agent', 'neutral', 50);
  add('credential', payload.credential || 'Credential', 'neutral', 50);
  edges.push({ id: 'e-agent-credential', source: 'agent', target: 'credential', animated: true });
  add('principal', payload.principal || providerLabel[provider] || providerLabel.custom, 'focus', 50);
  edges.push({ id: 'e-credential-principal', source: 'credential', target: 'principal', animated: true });

  const scopes = Array.isArray(payload.scopes) ? payload.scopes : [];
  if (scopes.length === 0) {
    add('empty', 'No scopes recorded', 'neutral', 50);
    edges.push({ id: 'e-principal-empty', source: 'principal', target: 'empty', animated: true });
  }

  scopes.forEach((scope, index) => {
    const id = `scope-${index}`;
    const y = 10 + (index * 70);
    const tone = scope.excess ? 'deny' : scope.effect === 'ALLOW' ? 'allow' : 'neutral';
    const marker = scope.excess ? 'EXCESS' : scope.effect || 'SCOPE';
    add(id, `${scope.name} (${marker})`, tone, y);
    edges.push({ id: `e-principal-${id}`, source: 'principal', target: id, animated: true });
  });

  return {
    provider,
    source: `${provider}-document`,
    nodes,
    edges,
  };
}

module.exports = { resolveCapability };
