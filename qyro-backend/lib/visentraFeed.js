const SENSITIVE_FLAG = ['can_access_phi', 'can_access_secrets', 'can_execute_code', 'can_modify_state'];

function providerOf(row) {
  const raw = String(row.cloud_provider || row.provider || 'custom').toLowerCase();
  if (raw.includes('aws') || raw.includes('bedrock')) return 'aws';
  if (raw.includes('gcp') || raw.includes('google') || raw.includes('vertex')) return 'gcp';
  if (raw.includes('azure') || raw.includes('foundry')) return 'azure';
  return 'custom';
}

function scopesOf(row) {
  const tools = Array.isArray(row.tools) ? row.tools : [];
  return tools.map((tool) => {
    const name = typeof tool === 'string' ? tool : tool?.name;
    if (!name) return null;
    const flags = tool && typeof tool === 'object' ? tool.risk_flags || {} : {};
    const excess = SENSITIVE_FLAG.some((flag) => flags[flag] === true);
    return { name, resource: name, effect: 'ALLOW', excess };
  }).filter(Boolean);
}

function statusOf(row) {
  const running = String(row.running_status || '').toLowerCase();
  if (/stop|inactive|down|error|stale/.test(running)) return 'Stale';
  return 'Active';
}

function discoveredHow(row) {
  if (row.howIdentified) return String(row.howIdentified);
  if (Array.isArray(row.source_collectors) && row.source_collectors.length) {
    return row.source_collectors.map(String).join(', ');
  }
  return '';
}

function identifiedWhere(row) {
  const cloud = String(row.cloud_provider || row.provider || '').trim();
  const region = String(row.region || '').trim();
  const place = [cloud ? cloud.toUpperCase() : '', region].filter(Boolean).join(' · ');
  const endpoint = String(row.endpoint || row.hostname || row.location || row.repository || '').trim();
  if (place && endpoint) return `${place} · ${endpoint}`;
  return place || endpoint;
}

function storesOf(row) {
  const stores = [];
  const push = (kind, value) => {
    const list = Array.isArray(value) ? value : value ? [value] : [];
    for (const item of list) {
      const name = typeof item === 'string' ? item : item?.name || item?.id || item?.arn;
      if (name) stores.push({ name: String(name).slice(0, 180), kind });
    }
  };
  push('vector', row.vector_database);
  push('memory', row.memory_store);
  if (/knowledgebase|knowledge base|vector store|rag/i.test(String(row.framework || ''))) {
    stores.push({ name: String(row.name), kind: 'knowledge' });
  }
  return stores;
}

function dataClassesOf(row) {
  const classification = row.dataAccessClassification || row.data_access_classification || {};
  const classes = Array.isArray(classification.dataClasses) ? classification.dataClasses : [];
  return classes.map((item) => String(item)).filter((item) => item && item !== 'none');
}

function mapVisentraAgent(row) {
  const id = String(row.agent_id || row.id || '').trim();
  const name = String(row.name || '').trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    source: 'Visentra',
    status: statusOf(row),
    model: String(row.model || '').trim(),
    discoveredHow: discoveredHow(row),
    identifiedWhere: identifiedWhere(row),
    discoveryStatus: String(row.agentStatus || row.running_status || '').trim(),
    owner: row.owner || null,
    identity: {
      provider: providerOf(row),
      payload: {
        credential: row.identity_used || row.framework || row.hostname || 'visentra',
        principal: row.fingerprint || id,
        scopes: scopesOf(row),
        dataClasses: dataClassesOf(row),
        stores: storesOf(row),
        internetAccess: row.internet_access === true,
        department: String(row.department || row.business_unit || '').trim(),
      },
    },
  };
}

function agentsFromFeed(body) {
  const list = Array.isArray(body?.agents) ? body.agents : Array.isArray(body) ? body : [];
  return list.map(mapVisentraAgent).filter(Boolean);
}

module.exports = { mapVisentraAgent, agentsFromFeed, providerOf };
