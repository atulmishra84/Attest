import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type AgentSummary, type Page } from '../lib/api';

export default function Discovery() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Page<AgentSummary>>('/api/agents?pageSize=100')
      .then((page) => setAgents(page.items))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load discovery'));
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Inventory</div>
          <h1>Agent Discovery</h1>
          <p className="lede">Agents pushed by AgentRadar, ready for capability resolution.</p>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      <div className="grid grid-3">
        {agents.map((agent) => (
          <button key={agent.id} className="card" type="button" onClick={() => navigate(`/agent/${agent.id}`)}>
            <div className="eyebrow">{agent.status}</div>
            <div className="strong" style={{ fontSize: 18, letterSpacing: '-0.03em', marginBottom: 6 }}>{agent.name}</div>
            <div className="muted">{agent.source}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
