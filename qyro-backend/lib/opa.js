const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const logger = require('./logger');
const { opaDuration } = require('./metrics');

const policiesDir = path.join(__dirname, '..', 'policies');
const activePolicyPath = path.join(__dirname, '..', 'data', 'active-assurance.rego');

function policyArgs() {
  if (fs.existsSync(activePolicyPath)) return ['-d', activePolicyPath];
  return ['-d', policiesDir];
}

async function evaluate(input) {
  const started = process.hrtime.bigint();
  try {
    const decisions = await evaluateHttp(input);
    return decisions;
  } catch (err) {
    logger.warn({ err: err.message }, 'OPA HTTP unavailable, using opa eval');
    return evaluateCli(input);
  } finally {
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    opaDuration.observe(seconds);
  }
}

async function evaluateHttp(input) {
  const base = process.env.OPA_URL || 'http://127.0.0.1:8181';
  const response = await fetch(`${base}/v1/data/qyro/assurance/decisions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(1500),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const body = await response.json();
  if (!Array.isArray(body.result)) {
    throw new Error('OPA returned no decision set');
  }
  return body.result;
}

function evaluateCli(input) {
  const args = ['eval', '-f', 'values', '-I', ...policyArgs(), 'data.qyro.assurance.decisions'];
  const result = spawnSync('opa', args, {
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || 'opa eval failed');
  }
  const parsed = JSON.parse(result.stdout);
  return Array.isArray(parsed[0]) ? parsed[0] : [];
}

function readBundledPolicy() {
  return fs.readFileSync(path.join(policiesDir, 'qyro.assurance.rego'), 'utf8');
}

function checkRego(rego) {
  const file = path.join(os.tmpdir(), `qyro-policy-${process.pid}.rego`);
  fs.writeFileSync(file, rego);
  const result = spawnSync('opa', ['check', file], { encoding: 'utf8' });
  fs.rmSync(file, { force: true });
  if (result.status !== 0) {
    throw new Error(result.stderr || 'Rego check failed');
  }
}

async function publishPolicy(rego) {
  checkRego(rego);
  fs.mkdirSync(path.dirname(activePolicyPath), { recursive: true });
  fs.writeFileSync(activePolicyPath, rego);
  const base = process.env.OPA_URL || 'http://127.0.0.1:8181';
  const response = await fetch(`${base}/v1/policies/qyro/assurance`, {
    method: 'PUT',
    headers: { 'content-type': 'text/plain' },
    body: rego,
  }).catch((err) => {
    logger.warn({ err: err.message }, 'could not push policy to OPA');
    return null;
  });
  if (response && !response.ok) {
    const text = await response.text();
    throw new Error(text || 'OPA rejected the policy');
  }
}

module.exports = { evaluate, publishPolicy, readBundledPolicy, checkRego };
