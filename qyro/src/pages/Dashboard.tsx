import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, downloadFile, formatWhen, getToken, type AgentSummary, type BlastRank, type CoverageRow, type DriftAlert, type FleetSummary, type Page } from '../lib/api';

const POSTURES = [
  { id: 'all', label: 'All' },
  { id: 'violated', label: 'Violated' },
  { id: 'ineffective', label: 'Ineffective' },
  { id: 'unknown', label: 'Unknown' },
  { id: 'effective', label: 'Effective' },
  { id: 'stale', label: 'Stale' },
  { id: 'quarantined', label: 'Quarantined' },
];

const PROVIDERS = [
  { id: 'all', label: 'All platforms' },
  { id: 'aws', label: 'AWS' },
  { id: 'gcp', label: 'GCP' },
  { id: 'azure', label: 'Azure' },
];

const EMPTY_SUMMARY: FleetSummary = {
  agents: 0, stale: 0, effective: 0, ineffective: 0, violated: 0, unknown: 0, notTested: 0,
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [alerts, setAlerts] = useState<DriftAlert[]>([]);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [blast, setBlast] = useState<BlastRank[]>([]);
  const [summary, setSummary] = useState<FleetSummary>(EMPTY_SUMMARY);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [posture, setPosture] = useState('all');
  const [provider, setProvider] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pageSize = 8;

  async function load(nextPage = page, nextQuery = query, nextPosture = posture, nextProvider = provider) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(pageSize),
        q: nextQuery,
        posture: nextPosture,
        provider: nextProvider,
      });
      const [data, drift, coverageRows, blastRows] = await Promise.all([
        api<Page<AgentSummary>>(`/api/agents?${params}`),
        api<DriftAlert[]>('/api/alerts?limit=6'),
        api<CoverageRow[]>('/api/reports/coverage'),
        api<BlastRank[]>('/api/agents/blast'),
      ]);
      setAgents(data.items);
      setTotal(data.total);
      setSummary(data.summary || EMPTY_SUMMARY);
      setAlerts(drift);
      setCoverage(coverageRows);
      setBlast(blastRows.slice(0, 3));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch agents');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(page, query, posture, provider);
    // Search submits explicitly. Filters and paging reload here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, posture, provider]);

  useEffect(() => {
    const token = getToken();
    if (!token) return undefined;
    const source = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
    const refresh = () => load(page, query, posture, provider);
    source.addEventListener('telemetry', refresh);
    source.addEventListener('drift', refresh);
    return () => source.close();
  }, [page, query, posture, provider]);

  function choosePosture(next: string) {
    setPosture(next);
    setPage(1);
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const viewHint = posture === 'all' && provider === 'all' ? 'Across the fleet' : 'In this view';

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Overview</div>
          <h1>Control Assurance</h1>
          <p className="lede">Continuous monitoring of discovered agents across all platforms.</p>
        </div>
        <div className="actions">
          <button className="btn ghost" type="button" onClick={() => downloadFile('/api/reports/assurance.csv', 'attest-assurance.csv')}>Export CSV</button>
          <button className="btn ghost" type="button" onClick={() => downloadFile('/api/reports/assurance.pdf', 'attest-assurance.pdf')}>Export PDF</button>
          <span className="pill outline">{summary.agents} agents</span>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}

      <h2 className="section-title">Framework coverage</h2>
      <div className="coverage">
        {coverage.length === 0 && <div className="card">Coverage appears after the first control evaluation.</div>}
        {coverage.map((row) => (
          <div key={`${row.framework}-${row.citation}`} className="card coverage-card">
            <div className="eyebrow">{row.framework}</div>
            <div className="strong">{row.citation}</div>
            <div className="muted" style={{ marginBottom: 8 }}>{row.title}</div>
            <div className="pills">
              {row.violated > 0 && <span className="pill bad">{row.violated} violated</span>}
              {row.ineffective > 0 && <span className="pill warn">{row.ineffective} ineffective</span>}
              {row.effective > 0 && <span className="pill good">{row.effective} effective</span>}
            </div>
          </div>
        ))}
      </div>

      <section className="card inbox">
        <div className="inbox-head">
          <h2 className="section-title" style={{ marginBottom: 0 }}>Blast radius</h2>
          <span className="muted">Before a call is made</span>
        </div>
        {blast.length === 0 && <p className="inbox-empty">No agents to rank yet.</p>}
        {blast.map((agent) => (
          <button key={agent.id} className="inbox-row" type="button" onClick={() => navigate(`/agent/${agent.id}`)}>
            <span>
              <span className="strong">{agent.name}</span>
              <span className="muted"> · {agent.reasons.slice(0, 2).join(' · ')}</span>
            </span>
            <span className="pill bad">{agent.score}</span>
          </button>
        ))}
      </section>

      <section className="card inbox">
        <div className="inbox-head">
          <h2 className="section-title" style={{ marginBottom: 0 }}>Drift inbox</h2>
          <span className="muted">{alerts.length ? `${alerts.length} recent` : 'Quiet'}</span>
        </div>
        {alerts.length === 0 && <p className="inbox-empty">No drift alerts. Controls have not moved off a holding state.</p>}
        {alerts.map((alert) => (
          <button key={alert.id} className="inbox-row" type="button" onClick={() => navigate(`/agent/${alert.agentId}`)}>
            <span>
              <span className="strong">{alert.agentName}</span>
              <span className="muted"> · {alert.message}</span>
            </span>
            <span className="muted">{formatWhen(alert.createdAt)}</span>
          </button>
        ))}
      </section>

      <form className="toolbar" onSubmit={(event) => {
        event.preventDefault();
        if (page === 1) load(1, query, posture, provider);
        else setPage(1);
      }}>
        <input className="search" value={query} placeholder="Search agents or sources" onChange={(event) => setQuery(event.target.value)} />
        <button className="btn primary" type="submit">Search</button>
      </form>

      <div className="chips" style={{ marginBottom: 10 }}>
        {POSTURES.map((item) => (
          <button key={item.id} className={`chip ${posture === item.id ? 'active' : ''}`} type="button" onClick={() => choosePosture(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="chips" style={{ marginBottom: 22 }}>
        {PROVIDERS.map((item) => (
          <button key={item.id} className={`chip ${provider === item.id ? 'active' : ''}`} type="button" onClick={() => { setProvider(item.id); setPage(1); }}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-4" style={{ marginBottom: 28 }}>
        {loading ? (
          Array.from({ length: 4 }, (_, index) => <div key={index} className="card stat"><div className="skeleton" /></div>)
        ) : (
          <>
            <button className="card stat good" type="button" onClick={() => choosePosture(posture === 'effective' ? 'all' : 'effective')}>
              <span className="stat-label">Effective controls</span>
              <span className="stat-value">{summary.effective}</span>
              <span className="stat-hint">{viewHint}</span>
            </button>
            <button className="card stat bad" type="button" onClick={() => choosePosture(posture === 'violated' ? 'all' : 'violated')}>
              <span className="stat-label">Violated controls</span>
              <span className="stat-value">{summary.violated}</span>
              <span className="stat-hint">Need attention</span>
            </button>
            <button className="card stat warn" type="button" onClick={() => choosePosture(posture === 'ineffective' ? 'all' : 'ineffective')}>
              <span className="stat-label">Ineffective</span>
              <span className="stat-value">{summary.ineffective}</span>
              <span className="stat-hint">{summary.notTested} not tested</span>
            </button>
            <button className="card stat unknown" type="button" onClick={() => choosePosture(posture === 'unknown' ? 'all' : 'unknown')}>
              <span className="stat-label">Unknown</span>
              <span className="stat-value">{summary.unknown}</span>
              <span className="stat-hint">{summary.stale} stale agents</span>
            </button>
          </>
        )}
      </div>

      <h2 className="section-title">Discovered agents</h2>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Agent Name</th>
              <th>Discovery Source</th>
              <th>Controls Summary</th>
              <th>Last Evaluated</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4}><div className="skeleton" /></td></tr>
            )}
            {!loading && agents.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: 'var(--text-muted)' }}>No agents match this view.</td>
              </tr>
            )}
            {!loading && agents.map((agent) => (
              <tr key={agent.id} className="clickable" onClick={() => navigate(`/agent/${agent.id}`)}>
                <td>
                  <div className="strong">{agent.name}</div>
                  <div className="pills" style={{ marginTop: 6 }}>
                    {agent.status === 'Stale' && <span className="pill warn">Stale</span>}
                    {agent.status === 'Quarantined' && <span className="pill bad">Quarantined</span>}
                    {agent.provider && <span className="pill outline">{agent.provider}</span>}
                  </div>
                </td>
                <td className="muted">{agent.source}</td>
                <td>
                  <div className="pills">
                    {agent.controls.violated > 0 && <span className="pill bad">{agent.controls.violated} Violated</span>}
                    {agent.controls.ineffective > 0 && <span className="pill warn">{agent.controls.ineffective} Ineffective</span>}
                    {agent.controls.unknown > 0 && <span className="pill unknown">{agent.controls.unknown} Unknown</span>}
                    {agent.controls.notTested > 0 && <span className="pill unknown">{agent.controls.notTested} Not tested</span>}
                    {agent.controls.effective > 0 && <span className="pill good">{agent.controls.effective} Effective</span>}
                    {agent.controls.violated + agent.controls.ineffective + agent.controls.unknown + agent.controls.notTested + agent.controls.effective === 0 && (
                      <span className="pill unknown">Not evaluated</span>
                    )}
                  </div>
                </td>
                <td className="muted">{formatWhen(agent.lastEvaluated)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button className="btn ghost" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button className="btn ghost" type="button" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Next</button>
      </div>
    </div>
  );
}
