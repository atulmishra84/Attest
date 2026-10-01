const logger = require('./logger');
const { agentsFromFeed, mapVisentraAgent } = require('./visentraFeed');
const { ingestAgents } = require('./discoveryIngest');

const state = {
  configured: false,
  connected: false,
  status: 'idle',
  lastError: null,
  lastSyncAt: null,
  lastCount: 0,
};

function feedStatus() {
  return { ...state };
}

function baseUrl() {
  return String(process.env.VISENTRA_URL || '').replace(/\/$/, '');
}

async function login(base) {
  if (process.env.VISENTRA_TOKEN) return process.env.VISENTRA_TOKEN;
  const email = process.env.VISENTRA_EMAIL;
  const password = process.env.VISENTRA_PASSWORD;
  if (!email || !password) {
    const error = new Error('Set VISENTRA_TOKEN or VISENTRA_EMAIL and VISENTRA_PASSWORD');
    error.status = 400;
    throw error;
  }
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.token) {
    throw new Error(body.error?.message || `Visentra login failed (${response.status})`);
  }
  return body.token;
}

async function pullAgents(base, token, agentId) {
  const path = agentId
    ? `/api/agents/${encodeURIComponent(agentId)}`
    : '/api/agents?limit=500';
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message || `Visentra agent read failed (${response.status})`);
  }
  if (agentId) return body.agent ? [mapVisentraAgent(body.agent)].filter(Boolean) : [];
  return agentsFromFeed(body);
}

async function syncFromVisentra(token, agentId) {
  const agents = await pullAgents(baseUrl(), token, agentId);
  const result = await ingestAgents(agents);
  state.lastSyncAt = new Date().toISOString();
  state.lastCount = result.synced;
  state.lastError = null;
  state.status = 'live';
  logger.info({ synced: result.synced, agentId: agentId || null }, 'visentra feed synced');
  return result;
}

let refreshTimer = null;

function scheduleSync(token) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    syncFromVisentra(token).catch((err) => {
      state.lastError = err.message;
      logger.warn({ err: err.message }, 'visentra feed sync failed');
    });
  }, 800);
}

function handleSseChunk(buffer, token) {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() || '';
  for (const block of parts) {
    const dataLine = block.split('\n').find((line) => line.startsWith('data:'));
    if (!dataLine) continue;
    let event;
    try {
      event = JSON.parse(dataLine.slice(5).trim());
    } catch {
      continue;
    }
    if (event.type === 'inventory.agent.updated' || event.type === 'graph.updated') {
      scheduleSync(token);
    }
  }
  return rest;
}

async function listen(token) {
  const response = await fetch(`${baseUrl()}/api/graph/stream?token=${encodeURIComponent(token)}`, {
    headers: { accept: 'text/event-stream' },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Visentra stream failed (${response.status})`);
  }
  state.connected = true;
  state.status = 'live';
  state.lastError = null;
  await syncFromVisentra(token);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = handleSseChunk(buffer, token);
  }
  state.connected = false;
}

function startVisentraFeed() {
  const base = baseUrl();
  state.configured = Boolean(base);
  if (!base) {
    state.status = 'not_configured';
    return;
  }
  let stopped = false;
  async function loop() {
    while (!stopped) {
      try {
        state.status = 'connecting';
        const token = await login(base);
        await listen(token);
      } catch (err) {
        state.connected = false;
        state.status = 'error';
        state.lastError = err.message;
        logger.warn({ err: err.message }, 'visentra feed disconnected');
      }
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }
  }
  loop();
  return () => { stopped = true; };
}

module.exports = { startVisentraFeed, feedStatus, syncFromVisentra };
