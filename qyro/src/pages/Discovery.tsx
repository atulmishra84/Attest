import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type AgentSummary, type Page } from '../lib/api';

const HOW_LABELS: Record<string, string> = {
  'aws-api-live': 'AWS API, live',
  'azure-scanner-v2': 'Azure identity scanner',
  'azure-arm-live': 'Azure ARM, live',
  cloud_aws: 'AWS cloud collector',
  cloud_azure: 'Azure cloud collector',
  identity_entra_agent: 'Entra agent identity',
};

function labelHow(value: string) {
  if (!value) return '—';
  return HOW_LABELS[value] || value.replace(/[-_]/g, ' ');
}

function labelStatus(agent: AgentSummary) {
  if (agent.status === 'Quarantined' || agent.status === 'Stale') return agent.status;
  const raw = agent.discoveryStatus || agent.status || '';
  if (!raw) return '—';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function statusPill(agent: AgentSummary) {
  const status = labelStatus(agent).toLowerCase();
  if (status === 'quarantined' || status === 'error') return 'bad';
  if (status === 'stale' || status === 'unknown') return 'warn';
  if (status === 'confirmed' || status === 'active' || status === 'running') return 'good';
  return 'outline';
}

export default function Discovery() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const query = (params.get('q') || '').trim().toLowerCase();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Page<AgentSummary>>('/api/agents?pageSize=200')
      .then((page) => setAgents(page.items))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load discovery'))
      .finally(() => setLoading(false));
  }, []);

  const visible = agents.filter((agent) => {
    if (!query) return true;
    return [agent.name, agent.model, agent.discoveredHow, agent.identifiedWhere, agent.status, agent.discoveryStatus]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Inventory</div>
          <h1>Agent Discovery</h1>
          <p className="lede">Agents arriving from the Visentra live feed.</p>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>LLM model</th>
              <th>Discovered</th>
              <th>Identified</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5}><div className="skeleton" /></td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: 'var(--text-muted)' }}>No agents discovered yet.</td>
              </tr>
            )}
            {visible.map((agent) => (
              <tr key={agent.id} className="clickable" onClick={() => navigate(`/agent/${agent.id}`)}>
                <td className="strong">{agent.name}</td>
                <td className="mono clip" title={agent.model || ''}>{agent.model || '—'}</td>
                <td>{labelHow(agent.discoveredHow || '')}</td>
                <td className="clip" title={agent.identifiedWhere || ''}>{agent.identifiedWhere || '—'}</td>
                <td><span className={`pill ${statusPill(agent)}`}>{labelStatus(agent)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
