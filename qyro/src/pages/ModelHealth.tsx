import { useEffect, useState } from 'react';
import { api, formatWhen, getToken } from '../lib/api';

type Drift = { recent: number; prior: number; drop: number; degraded: boolean } | null;
type ModelRow = {
  model: string;
  calls: number;
  ttftP50: number | null;
  ttftP95: number | null;
  latencyP95: number | null;
  scanShare: number | null;
  drift: Drift;
  slow: boolean;
};
type Fallback = { primary: string; backup: string; routes: number; failures: number };
type Alert = { id: string; agentName: string; summary: string; evidence: string; createdAt: string };
type OpsReport = {
  budgets: { latencyMs: number; ttftMs: number };
  models: ModelRow[];
  fallbacks: Fallback[];
  alerts: Alert[];
};

const EMPTY: OpsReport = { budgets: { latencyMs: 4000, ttftMs: 1500 }, models: [], fallbacks: [], alerts: [] };

function ms(value: number | null) {
  return value == null ? '—' : `${Math.round(value)} ms`;
}

export default function ModelHealth() {
  const [report, setReport] = useState<OpsReport>(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next = await api<OpsReport>('/api/telemetry/ops');
        if (!cancelled) {
          setReport(next);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load model health');
      }
    }
    load();
    const token = getToken();
    if (!token) return () => { cancelled = true; };
    const source = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
    const refresh = () => load();
    source.addEventListener('telemetry', refresh);
    source.addEventListener('decision', refresh);
    return () => {
      cancelled = true;
      source.close();
    };
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">LLMOps</div>
          <h1>Model Health</h1>
          <p className="lede">Time to first token, end-to-end latency, accuracy drift on calls that carry an eval score, and whether traffic failed over to a backup model.</p>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}

      <h2 className="section-title">Latency</h2>
      <p className="muted">A call is slow above {report.budgets.ttftMs} ms to first token or {report.budgets.latencyMs} ms end to end. Scan share is the scanning time as a percent of latency.</p>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr><th>Model</th><th>Calls</th><th>TTFT p50</th><th>TTFT p95</th><th>Latency p95</th><th>Scan share</th><th>Status</th></tr>
          </thead>
          <tbody>
            {report.models.length === 0 && <tr><td colSpan={7}>No models are on the live inventory yet.</td></tr>}
            {report.models.map((row) => (
              <tr key={row.model}>
                <td className="strong">{row.model}</td>
                <td className="mono">{row.calls}</td>
                <td className="mono">{ms(row.ttftP50)}</td>
                <td className="mono">{ms(row.ttftP95)}</td>
                <td className="mono">{ms(row.latencyP95)}</td>
                <td className="mono">{row.scanShare == null ? '—' : `${row.scanShare}%`}</td>
                <td>{row.slow ? <span className="pill bad">Slow</span> : row.calls ? <span className="pill good">Within budget</span> : <span className="pill outline">No sample</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Drift</h2>
      <div className="card table-card">
        <table className="table">
          <thead><tr><th>Model</th><th>Prior accuracy</th><th>Last 24h</th><th>Drop</th></tr></thead>
          <tbody>
            {report.models.filter((row) => row.drift).length === 0 && (
              <tr><td colSpan={4}>Drift needs at least three eval scores in the last day and three in the six days before that.</td></tr>
            )}
            {report.models.filter((row) => row.drift).map((row) => (
              <tr key={row.model}>
                <td className="strong">{row.model}</td>
                <td className="mono">{row.drift?.prior}</td>
                <td className="mono">{row.drift?.recent}</td>
                <td>{row.drift?.degraded ? <span className="pill bad">{row.drift.drop} point drop</span> : <span className="pill outline">{row.drift?.drop}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Fallback and redundancy</h2>
      <div className="card table-card">
        <table className="table">
          <thead><tr><th>Primary</th><th>Backup</th><th>Routes</th><th>Failures</th></tr></thead>
          <tbody>
            {report.fallbacks.length === 0 && (
              <tr><td colSpan={4}>No failover yet. Send primary_model and routed_to when a call moves to another provider.</td></tr>
            )}
            {report.fallbacks.map((row) => (
              <tr key={`${row.primary}-${row.backup}`}>
                <td className="mono">{row.primary}</td>
                <td className="mono">{row.backup}</td>
                <td className="mono">{row.routes}</td>
                <td>{row.failures ? <span className="pill bad">{row.failures}</span> : <span className="pill good">Held</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.alerts.length > 0 && (
        <div className="card table-card">
          <table className="table">
            <thead><tr><th>When</th><th>Agent</th><th>Latency</th></tr></thead>
            <tbody>
              {report.alerts.map((row) => (
                <tr key={row.id}>
                  <td className="muted">{formatWhen(row.createdAt)}</td>
                  <td className="strong">{row.agentName}</td>
                  <td className="muted">{row.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
