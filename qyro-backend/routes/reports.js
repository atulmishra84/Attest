const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { citationsFor, citationLabel } = require('../lib/citations');
const { ensureThreatScan } = require('../lib/threats');

const router = express.Router();

router.use(requireAuth, requireRole('ADMIN', 'AUDITOR'));

router.get('/coverage', async (req, res) => {
  const coverage = await coverageReport();
  res.json(coverage);
});

router.get('/evidence', async (req, res) => {
  const pack = await buildEvidencePack();
  res.json(pack);
});

router.get('/evidence.csv', async (req, res) => {
  const pack = await buildEvidencePack();
  const header = ['agent_id', 'agent', 'status', 'control_id', 'control', 'state', 'evidence', 'frameworks'];
  const lines = [header.join(',')];
  for (const row of pack.controls) {
    lines.push([
      row.agentId,
      csv(row.agentName),
      row.status,
      row.controlId,
      csv(row.controlName),
      row.state,
      csv(row.evidence),
      csv(row.frameworks),
    ].join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="attest-evidence-pack.csv"');
  res.send(lines.join('\n'));
});

router.get('/assurance.csv', async (req, res) => {
  const rows = await loadRows();
  const header = ['agent_id', 'name', 'source', 'status', 'control_id', 'control', 'state', 'evidence'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      row.agentId,
      csv(row.agentName),
      csv(row.source),
      row.status,
      row.controlId,
      csv(row.controlName),
      row.state,
      csv(row.evidence),
    ].join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="attest-assurance.csv"');
  res.send(lines.join('\n'));
});

router.get('/assurance.pdf', async (req, res) => {
  const rows = await loadRows();
  const lines = ['Attest Control Assurance', ''];
  for (const row of rows.slice(0, 40)) {
    lines.push(`${row.agentName} | ${row.controlId} ${row.controlName} | ${row.state}`);
  }
  const pdf = pdfFromText(lines.join('\n'));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="attest-assurance.pdf"');
  res.send(pdf);
});

async function coverageReport() {
  const results = await prisma.controlResult.findMany({
    where: { deletedAt: null, agent: { deletedAt: null } },
    orderBy: { evaluatedAt: 'desc' },
  });
  const latest = new Map();
  for (const result of results) {
    const key = `${result.agentId}:${result.controlId}`;
    if (!latest.has(key)) latest.set(key, result);
  }
  const groups = new Map();
  for (const result of latest.values()) {
    for (const cite of citationsFor(result.controlId)) {
      const key = `${cite.framework} ${cite.citation}`;
      if (!groups.has(key)) {
        groups.set(key, {
          framework: cite.framework,
          citation: cite.citation,
          title: cite.title,
          effective: 0,
          violated: 0,
          ineffective: 0,
          other: 0,
        });
      }
      const bucket = groups.get(key);
      if (result.state === 'EFFECTIVE') bucket.effective += 1;
      else if (result.state === 'VIOLATED' || result.state === 'BLOCKED_VIOLATION') bucket.violated += 1;
      else if (result.state === 'INEFFECTIVE') bucket.ineffective += 1;
      else bucket.other += 1;
    }
  }
  return [...groups.values()].sort((left, right) => right.violated - left.violated || left.framework.localeCompare(right.framework));
}

async function buildEvidencePack() {
  await ensureThreatScan();
  const rows = await loadRows();
  const [threats, quarantined] = await Promise.all([
    prisma.threatFinding.findMany({
      where: { agent: { deletedAt: null } },
      include: { agent: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.agent.findMany({
      where: { deletedAt: null, status: 'Quarantined' },
      select: { id: true, name: true, status: true },
    }),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    controls: rows.map((row) => ({
      ...row,
      citations: citationsFor(row.controlId),
      frameworks: citationLabel(row.controlId),
    })),
    threats: threats.map((finding) => ({
      id: finding.id,
      agentId: finding.agentId,
      agentName: finding.agent.name,
      kind: finding.kind,
      summary: finding.summary,
      evidence: finding.evidence,
      createdAt: finding.createdAt,
    })),
    quarantined,
  };
}

async function loadRows() {
  const results = await prisma.controlResult.findMany({
    where: { deletedAt: null, agent: { deletedAt: null } },
    include: {
      agent: { select: { name: true, discoverySource: true, status: true } },
      control: { select: { name: true } },
    },
    orderBy: { evaluatedAt: 'desc' },
    take: 2000,
  });
  const latest = new Map();
  for (const result of results) {
    const key = `${result.agentId}:${result.controlId}`;
    if (!latest.has(key)) latest.set(key, result);
  }
  return [...latest.values()].map((result) => ({
    agentId: result.agentId,
    agentName: result.agent.name,
    source: result.agent.discoverySource,
    status: result.agent.status,
    controlId: result.controlId,
    controlName: result.control.name,
    state: result.state,
    evidence: result.evidencePayload?.message || '',
  }));
}

function csv(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function pdfFromText(text) {
  const commands = ['BT', '/F1 11 Tf', '48 760 Td'];
  text.split('\n').forEach((line, index) => {
    const safe = line.replace(/[()\\]/g, ' ').slice(0, 110);
    commands.push(index === 0 ? `(${safe}) Tj` : `0 -16 Td (${safe}) Tj`);
  });
  commands.push('ET');
  const stream = commands.join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += `${object}\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

module.exports = router;
