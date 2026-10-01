const prisma = require('./prisma');

const COPYLEFT = [
  /SPDX-License-Identifier:\s*(?:GPL|AGPL|LGPL|EUPL|OSL|SSPL|MPL)[-0-9.]*/i,
  /GNU (?:Affero |Lesser )?General Public License/i,
  /licensed under the (?:GNU |Affero )?(?:GPL|AGPL|LGPL)\b/i,
  /\b(?:AGPL|GPL|LGPL|EUPL|SSPL)-[0-9.]+/i,
];

const IP_BLOCKING = new Set(['COPYLEFT_LICENSE', 'COPYRIGHT_PROXIMITY', 'TRADEMARK']);
const PROXIMITY_AT = 55;

function words(text) {
  return String(text || '').toLowerCase().match(/[a-z0-9']+/g) || [];
}

function shingles(text) {
  const list = words(text);
  const set = new Set();
  for (let index = 0; index <= list.length - 5; index += 1) set.add(list.slice(index, index + 5).join(' '));
  return set;
}

function proximityScore(output, reference, copyrightScore) {
  const supplied = Number(copyrightScore);
  if (Number.isFinite(supplied) && supplied >= 0) return Math.round(supplied <= 1 ? supplied * 100 : supplied);
  const corpus = Array.isArray(reference) ? reference.join('\n') : String(reference || '');
  if (corpus.trim().length < 80) return null;
  const left = shingles(output);
  const right = shingles(corpus);
  if (left.size < 3 || right.size < 3) return null;
  let hit = 0;
  for (const item of left) if (right.has(item)) hit += 1;
  return Math.round((100 * hit) / left.size);
}

function inspectIp(input) {
  const output = String(input.output || '');
  const findings = [];
  const notice = COPYLEFT.map((pattern) => output.match(pattern)?.[0]).find(Boolean);
  if (notice) {
    findings.push({
      kind: 'COPYLEFT_LICENSE',
      severity: 'high',
      summary: 'Output contains a copyleft license notice',
      evidence: notice.slice(0, 80),
    });
  }

  const score = proximityScore(output, input.reference || input.copyrighted_text, input.copyrightScore ?? input.copyright_score);
  if (score != null && score >= PROXIMITY_AT) {
    findings.push({
      kind: 'COPYRIGHT_PROXIMITY',
      severity: 'high',
      summary: 'Output is close to supplied copyrighted or patented material',
      evidence: `proximity ${score}`,
    });
  }

  const marks = (Array.isArray(input.trademarks) ? input.trademarks : []).map((mark) => String(mark).trim()).filter((mark) => mark.length >= 3);
  const seen = marks.filter((mark) => new RegExp(`\\b${mark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(output));
  if (seen.length) {
    findings.push({
      kind: 'TRADEMARK',
      severity: 'high',
      summary: 'Output uses a supplied trademark',
      evidence: seen.slice(0, 3).join(', ').slice(0, 80),
    });
  }
  return findings;
}

async function ipReport() {
  const since = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
  const findings = await prisma.threatFinding.findMany({
    where: {
      kind: { in: [...IP_BLOCKING] },
      createdAt: { gte: since },
      agent: { deletedAt: null },
    },
    include: { agent: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 80,
  });
  const count = (kind) => findings.filter((finding) => finding.kind === kind).length;
  return {
    generatedAt: new Date().toISOString(),
    proximityAt: PROXIMITY_AT,
    counts: {
      copyleft: count('COPYLEFT_LICENSE'),
      proximity: count('COPYRIGHT_PROXIMITY'),
      trademark: count('TRADEMARK'),
    },
    findings: findings.map((finding) => ({
      id: finding.id,
      agentId: finding.agentId,
      agentName: finding.agent.name,
      kind: finding.kind,
      summary: finding.summary,
      evidence: finding.evidence,
      createdAt: finding.createdAt,
    })),
  };
}

module.exports = { inspectIp, ipReport, proximityScore, IP_BLOCKING, PROXIMITY_AT };
