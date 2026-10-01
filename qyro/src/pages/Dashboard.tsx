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

const FRAMEWORK_ORDER = ['EU AI Act', 'ISO/IEC 42001', 'NIST AI RMF', 'OWASP Agentic 2026', 'HIPAA', 'OWASP LLM'];

function readiness(counts: { effective: number; violated: number; ineffective: number; other?: number; unknown?: number; notTested?: number }) {
  const total = counts.effective + counts.violated + counts.ineffective + (counts.other || 0) + (counts.unknown || 0) + (counts.notTested || 0);
  if (!total) return null;
  return Math.round((100 * counts.effective) / total);
}

function placeOf(agent: AgentSummary) {
  const where = agent.identifiedWhere || agent.source;
  const parts = where.split(' · ');
  return parts.length > 2 ? parts.slice(0, 2).join(' · ') : where;
}

function tone(score: number | null) {
  if (score == null) return '';
  if (score >= 80) return 'good';
  if (score >= 40) return 'warn';
  return 'bad';
}

function groupCoverage(rows: CoverageRow[]) {
  const groups = new Map<string, CoverageRow & { citations: CoverageRow[] }>();
  for (const row of rows) {
    const current = groups.get(row.framework) || {
      framework: row.framework,
      citation: '',
      title: '',
      effective: 0,
      violated: 0,
      ineffective: 0,
      other: 0,
      citations: [],
    };
    current.effective += row.effective;
    current.violated += row.violated;
    current.ineffective += row.ineffective;
    current.other += row.other;
    current.citations.push(row);
    groups.set(row.framework, current);
  }
  return [...groups.values()].sort((left, right) => {
    const leftAt = FRAMEWORK_ORDER.indexOf(left.framework);
    const rightAt = FRAMEWORK_ORDER.indexOf(right.framework);
    return (leftAt === -1 ? 99 : leftAt) - (rightAt === -1 ? 99 : rightAt);
  });
}

function PostureMix({ controls }: { controls: AgentSummary['controls'] }) {
  const parts = [
    { key: 'bad', count: controls.violated },
    { key: 'warn', count: controls.ineffective },
    { key: 'unknown', count: controls.unknown + controls.notTested },
    { key: 'good', count: controls.effective },
  ];
  const total = parts.reduce((sum, part) => sum + part.count, 0);
  if (!total) return <span className="pill unknown">Not evaluated</span>;
  const label = [
    controls.violated ? `${controls.violated} violated` : '',
    controls.effective ? `${controls.effective} effective` : '',
    controls.ineffective ? `${controls.ineffective} ineffective` : '',
  ].filter(Boolean).join(' · ');
  return (
    <div>
      <div className="mix" role="img" aria-label={label}>
        {parts.filter((part) => part.count > 0).map((part) => (
          <i key={part.key} className={part.key} style={{ width: `${(100 * part.count) / total}%` }} />
        ))}
      </div>
      <div className="muted" style={{ marginTop: 4 }}>{label}</div>
    </div>
  );
}

function ResultMix({ row }: { row: Pick<CoverageRow, 'effective' | 'violated' | 'ineffective' | 'other'> }) {
  const parts = [
    { key: 'bad', count: row.violated },
    { key: 'warn', count: row.ineffective },
    { key: 'unknown', count: row.other },
    { key: 'good', count: row.effective },
  ];
  const total = parts.reduce((sum, part) => sum + part.count, 0);
  if (!total) return <div className="mix" />;
  return (
    <div className="mix" role="img" aria-label={`${row.effective} effective, ${row.violated} violated, ${row.other} not ready`}>
      {parts.filter((part) => part.count > 0).map((part) => (
        <i key={part.key} className={part.key} style={{ width: `${(100 * part.count) / total}%` }} />
      ))}
    </div>
  );
}

function FrameworkPosture({ frameworks }: { frameworks: Array<CoverageRow & { citations: CoverageRow[] }> }) {
  const [focus, setFocus] = useState('');
  const ranked = frameworks.map((row) => ({ ...row, score: readiness(row) }));
  const weakest = [...ranked].sort((left, right) => (left.score ?? 101) - (right.score ?? 101))[0];
  const active = ranked.find((row) => row.framework === focus) || weakest;
  if (!active) return <div className="card">Coverage appears after the first control evaluation.</div>;
  const gap = [
    { count: active.other, text: `${active.other} results are not ready yet, so the score stays low even where few controls are violated.` },
    { count: active.ineffective, text: `${active.ineffective} results are ineffective. The control is in place, but it does not hold for how these agents are used.` },
    { count: active.violated, text: `${active.violated} results are violated. That is what pulls this framework down.` },
  ].sort((left, right) => right.count - left.count)[0];
  const story = gap && gap.count > 0 ? gap.text : 'Every assessed result in this framework is effective.';
  const citations = [...active.citations].sort((left, right) => (readiness(left) ?? 101) - (readiness(right) ?? 101));

  return (
    <div className="posture-board">
      <div className="posture-nav">
        {ranked.map((row) => (
          <button key={row.framework} type="button" className={`posture-pick ${tone(row.score)} ${row.framework === active.framework ? 'active' : ''}`} onClick={() => setFocus(row.framework)}>
            <span>
              <span className="strong">{row.framework}</span>
              <span style={{ display: 'block', marginTop: 6 }}><ResultMix row={row} /></span>
            </span>
            <span className="stat-value">{row.score == null ? '—' : `${row.score}%`}</span>
          </button>
        ))}
      </div>
      <section className="card">
        <div className="inbox-head">
          <div>
            <div className="eyebrow">Selected framework</div>
            <h2 className="section-title" style={{ marginBottom: 0 }}>{active.framework}</h2>
          </div>
          <div className={`readiness ${tone(active.score)}`}>
            <div className="stat-value">{active.score == null ? '—' : `${active.score}%`}</div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}><ResultMix row={active} /></div>
        <div className="legend">
          <span><i className="good" />{active.effective} effective</span>
          <span><i className="bad" />{active.violated} violated</span>
          <span><i className="warn" />{active.ineffective} ineffective</span>
          <span><i className="unknown" />{active.other} not ready</span>
        </div>
        <p className="muted">{story}</p>
        <table className="table">
          <thead>
            <tr>
              <th>Citation</th>
              <th>Control</th>
              <th>Mix</th>
              <th>Ready</th>
            </tr>
          </thead>
          <tbody>
            {citations.map((cite) => (
              <tr key={cite.citation}>
                <td>
                  <div className="strong">{cite.citation}</div>
                  <div className="muted">{cite.title}</div>
                </td>
                <td className="mono">{(cite.controls || []).join(', ') || '—'}</td>
                <td style={{ minWidth: 120 }}><ResultMix row={cite} /></td>
                <td className={`mono ${tone(readiness(cite))}`}>{readiness(cite) == null ? '—' : `${readiness(cite)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

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
  const fleetScore = readiness(summary);
  const frameworks = groupCoverage(coverage);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Overview</div>
          <h1>Control Assurance</h1>
          <p className="lede">Which controls are holding, which agents are exposed, and which frameworks those results map to.</p>
        </div>
        <div className="actions">
          <button className="btn ghost" type="button" onClick={() => downloadFile('/api/reports/assurance.csv', 'attest-assurance.csv')}>Export CSV</button>
          <button className="btn ghost" type="button" onClick={() => downloadFile('/api/reports/assurance.pdf', 'attest-assurance.pdf')}>Export PDF</button>
          <div className={`readiness ${tone(fleetScore)}`}>
            <div className="stat-label">Fleet readiness</div>
            <div className="stat-value">{fleetScore == null ? '—' : `${fleetScore}%`}</div>
          </div>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="grid grid-4" style={{ marginBottom: 22 }}>
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
              <span className="stat-hint">{summary.stale} stale · {summary.agents} agents</span>
            </button>
          </>
        )}
      </div>

      <h2 className="section-title">Framework posture</h2>
      <p className="muted">Pick a framework to see every citation. Green is effective, red is violated, amber is ineffective, and blue is not ready.</p>
      <FrameworkPosture frameworks={frameworks} />

      <div className="grid grid-2" style={{ margin: '22px 0' }}>
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
      </div>

      <h2 className="section-title">Discovered agents</h2>
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

      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Where</th>
              <th>Control posture</th>
              <th>Last evaluated</th>
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
                  {agent.model && <div className="muted clip">{agent.model}</div>}
                  <div className="pills" style={{ marginTop: 6 }}>
                    {agent.status === 'Stale' && <span className="pill warn">Stale</span>}
                    {agent.status === 'Quarantined' && <span className="pill bad">Quarantined</span>}
                    {agent.provider && <span className="pill outline">{agent.provider}</span>}
                  </div>
                </td>
                <td className="muted">{placeOf(agent)}</td>
                <td><PostureMix controls={agent.controls} /></td>
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
