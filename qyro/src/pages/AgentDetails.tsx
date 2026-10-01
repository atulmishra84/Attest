import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ReactFlow, { Background, Controls, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { api, formatWhen, getStoredUser, type Assurance, type IntentControl } from '../lib/api';

function pillClass(state: string) {
  if (state === 'EFFECTIVE') return 'good';
  if (state === 'VIOLATED' || state === 'BLOCKED_VIOLATION') return 'bad';
  if (state === 'INEFFECTIVE') return 'warn';
  return 'unknown';
}

type Framework = {
  id: string;
  name: string;
  controls: IntentControl[];
};

export default function AgentDetails() {
  const { id } = useParams();
  const isAdmin = getStoredUser()?.role === 'ADMIN';
  const [data, setData] = useState<Assurance | null>(null);
  const [controls, setControls] = useState<IntentControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quarantineBusy, setQuarantineBusy] = useState(false);
  const [error, setError] = useState('');

  async function load(agentId: string) {
    const [assurance, frameworks] = await Promise.all([
      api<Assurance>(`/api/agents/${agentId}/assurance`),
      api<Framework[]>('/api/frameworks').catch(() => [] as Framework[]),
    ]);
    setData(assurance);
    setControls(frameworks.flatMap((framework) => framework.controls));
  }

  useEffect(() => {
    if (!id) return;
    load(id)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to fetch assurance data'))
      .finally(() => setLoading(false));
  }, [id]);

  async function refreshCapability() {
    if (!id) return;
    setRefreshing(true);
    setError('');
    try {
      await api(`/api/agents/${id}/capability/refresh`, { method: 'POST' });
      await load(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Capability refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

  async function setQuarantine(action: 'quarantine' | 'release') {
    if (!id) return;
    setQuarantineBusy(true);
    setError('');
    try {
      await api(`/api/agents/${id}/quarantine`, { method: 'POST', body: JSON.stringify({ action }) });
      await load(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quarantine update failed');
    } finally {
      setQuarantineBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="grid" style={{ gap: 16 }}>
        <div className="skeleton" />
        <div className="card"><div className="skeleton" /></div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/" className="back-link">
            <ArrowLeft size={16} /> Back to overview
          </Link>
          <div className="eyebrow">{data?.status || 'Unknown'}</div>
          <h1>{data?.name || 'Agent'}</h1>
          <p className="lede">{id} · {data?.source || 'Attest'}</p>
        </div>
        {isAdmin && (
          <div className="actions">
            {data?.status === 'Quarantined' ? (
              <button className="btn ghost" type="button" onClick={() => setQuarantine('release')} disabled={quarantineBusy}>
                {quarantineBusy ? 'Updating…' : 'Release'}
              </button>
            ) : (
              <button className="btn ghost" type="button" onClick={() => setQuarantine('quarantine')} disabled={quarantineBusy}>
                {quarantineBusy ? 'Updating…' : 'Quarantine'}
              </button>
            )}
            <button className="btn primary" type="button" onClick={refreshCapability} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh capability'}
            </button>
          </div>
        )}
      </div>

      {data?.status === 'Quarantined' && (
        <div className="error-text">This agent is quarantined. New calls are recorded and blocked.</div>
      )}

      {error && <div className="error-text">{error}</div>}

      <div style={{ marginBottom: '40px' }}>
        <h2 className="section-title">Capability chain</h2>
        <div className="graph-frame">
          {data?.capability?.nodes?.length ? (
            <ReactFlow nodes={data.capability.nodes as Node[]} edges={(data.capability.edges || []) as Edge[]} fitView>
              <Background />
              <Controls />
            </ReactFlow>
          ) : (
            <div style={{ padding: 24, color: 'var(--text-muted)' }}>No capability snapshot for this agent yet.</div>
          )}
        </div>
        <p className="lede" style={{ marginTop: 12 }}>
          Resolved from the {data?.capability?.provider || 'custom'} identity document ({data?.capability?.source || 'unresolved'}).
          {data?.capability?.evaluatedAt ? ` Snapshot ${formatWhen(data.capability.evaluatedAt)}.` : ''}
          {' '}Scopes marked EXCESS are outside approved intent.
        </p>
      </div>

      <div className="grid grid-2" style={{ marginBottom: '40px', alignItems: 'start' }}>
        <div>
          <h3 className="section-title">Approved controls</h3>
          <ul className="intent-list">
            {controls.length === 0 && <li>No published controls yet.</li>}
            {controls.map((control) => (
              <li key={control.id}>
                <span className="mono">{control.id}</span> · {control.name}
                <span className={`pill ${control.requirementType === 'ALLOW' ? 'good' : 'bad'}`} style={{ marginLeft: 8 }}>
                  {control.requirementType}
                </span>
                {control.intentDesc && <div>{control.intentDesc}</div>}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="section-title">Runtime telemetry</h3>
          <div className="code-block">
            {data?.runtime_events?.length ? data.runtime_events.map((event) => (
              <div key={event.id}>
                {event.operation || event.event_type} {event.resource || ''}
              </div>
            )) : 'No runtime events yet.'}
          </div>
        </div>
      </div>

      <h2 className="section-title">Threats on this agent</h2>
      <div className="grid" style={{ gap: 12, marginBottom: 32 }}>
        {(data?.threats || []).length === 0 && <div className="card">No prompt, tool, or sensitive-data findings for this agent.</div>}
        {data?.threats?.map((finding) => (
          <div key={finding.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{finding.summary}</div>
              <div className="muted">{finding.evidence}</div>
            </div>
            <span className="pill bad">{finding.kind.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </div>

      {data?.gate && (
        <div className="card" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <div>
            <div className="eyebrow">Last gate decision</div>
            <div style={{ fontWeight: 700, margin: '4px 0' }}>
              {(data.gate.operation || 'call')} {data.gate.resource || ''}
            </div>
            <div className="muted">{data.gate.reason}</div>
          </div>
          <span className={`pill ${data.gate.decision === 'block' ? 'bad' : 'good'}`}>{data.gate.decision}</span>
        </div>
      )}

      <h2 className="section-title">Control assurance results</h2>
      <div className="grid" style={{ gap: '12px' }}>
        {data?.control_results?.length === 0 && (
          <div className="card">No control results yet for this agent.</div>
        )}
        {data?.control_results?.map((cr) => (
          <div key={cr.control_id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '16px 20px' }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>{cr.control_id} · {cr.name}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {cr.description}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 4 }}>{formatWhen(cr.evaluatedAt)}</div>
              {data?.gate?.decision === 'block' && data.gate.controls?.some((control) => control.control_id === cr.control_id && (control.state === 'VIOLATED' || control.state === 'BLOCKED_VIOLATION')) && (
                <div style={{ fontSize: '12px', marginTop: 6 }}>Blocked at the gate before the call ran.</div>
              )}
            </div>
            <span className={`pill ${pillClass(cr.state)}`}>
              {cr.state}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
