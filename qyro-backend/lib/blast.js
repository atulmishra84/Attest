const SENSITIVE = /patient|\bphi\b|\bssn\b|secret|password/i;

function scoreBlast(payload, owner) {
  const scopes = Array.isArray(payload?.scopes) ? payload.scopes : [];
  let score = 0;
  const reasons = [];
  for (const scope of scopes) {
    const label = scope.name || scope.resource || 'scope';
    if (scope.excess) {
      score += 5;
      reasons.push(`${label} is an excess permission`);
    }
    const token = `${scope.resource || ''} ${scope.name || ''}`;
    if (SENSITIVE.test(token)) {
      score += 4;
      reasons.push(`${label} can reach sensitive data`);
    }
  }
  if (!owner) {
    score += 2;
    reasons.push('No owner');
  }
  return { score, reasons };
}

module.exports = { scoreBlast };
