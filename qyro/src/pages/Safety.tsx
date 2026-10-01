import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatWhen, getToken } from '../lib/api';

type Alert = { id: string; agentId: string; agentName: string; kind: string; summary: string; evidence: string; createdAt: string };
type RagRow = { agentId: string; agentName: string; stores: string[]; index: number | null; samples: number; alert: boolean };
type BiasDay = { date: string; samples: number; score: number | null };
type Attribute = { attribute: string; samples: number; score: number; workflows: Record<string, number> };
type SafetyReport = {
  alertAt: number;
  toxicity: { hate: number; harassment: number; toxic: number };
  alerts: Alert[];
  rag: RagRow[];
  bias: { days: BiasDay[]; attributes: Attribute[] };
};

const EMPTY: SafetyReport = {
  alertAt: 60,
  toxicity: { hate: 0, harassment: 0, toxic: 0 },
  alerts: [],
  rag: [],
  bias: { days: [], attributes: [] },
};

const LABELS: Record<string, string> = {
  HATE_SPEECH: 'Hate speech',
  HARASSMENT: 'Harassment',
  TOXIC_OUTPUT: 'Toxic output',
  HALLUCINATION: 'Hallucination',
  BIAS_ALERT: 'Bias',
};

export default function Safety() {
  const navigate = useNavigate();
  const [report, setReport] = useState<SafetyReport>(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next = await api<SafetyReport>('/api/telemetry/safety');
        if (!cancelled) {
          setReport(next);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load safety');
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

  const maxBias = Math.max(1, ...report.bias.days.map((day) => day.score || 0));
  const biasSamples = report.bias.days.reduce((sum, day) => sum + day.samples, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Human and brand safety</div>
          <h1>Safety & Ethics</h1>
          <p className="lede">Toxicity flags, how closely RAG answers stay on the retrieved documents, and fairness scores supplied by HR, finance, and legal workflows.</p>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}

      <h2 className="section-title">Toxicity and hate speech</h2>
      <div className="grid grid-3">
        <div className="card stat bad"><div className="stat-label">Hate speech, 24h</div><div className="stat-value">{report.toxicity.hate}</div></div>
        <div className="card stat warn"><div className="stat-label">Harassment, 24h</div><div className="stat-value">{report.toxicity.harassment}</div></div>
        <div className="card stat bad"><div className="stat-label">Toxic output, 24h</div><div className="stat-value">{report.toxicity.toxic}</div></div>
      </div>

      <h2 className="section-title">Hallucination index</h2>
      <p className="muted">Overlap with retrieved sources, or a groundedness score on the call. A quality alert fires at {report.alertAt} or higher.</p>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr><th>RAG agent</th><th>Sources</th><th>Index</th><th>Samples</th><th>Alert</th></tr>
          </thead>
          <tbody>
            {report.rag.length === 0 && <tr><td colSpan={5}>No retrieval store is attached to a live agent yet.</td></tr>}
            {report.rag.map((row) => (
              <tr key={row.agentId} className="clickable" onClick={() => navigate(`/agent/${row.agentId}`)}>
                <td className="strong">{row.agentName}</td>
                <td className="muted">{row.stores.join(', ') || '—'}</td>
                <td className="mono">{row.index == null ? '—' : row.index}</td>
                <td className="mono">{row.samples}</td>
                <td>{row.alert ? <span className="pill bad">Quality alert</span> : row.samples ? <span className="pill good">Grounded</span> : <span className="pill outline">No sample</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Bias and fairness</h2>
      <div className="card">
        {biasSamples === 0 && <p className="muted">No fairness labels yet. Send bias_score with an attribute such as age_band, and a workflow of HR, finance, or legal. Attest does not infer a demographic from a person's name.</p>}
        {biasSamples > 0 && (
          <div className="bars">
            {report.bias.days.map((day) => (
              <div className="bar-row" key={day.date}>
                <span>{day.date}</span>
                <div className="bar-track"><i className={day.score != null && day.score >= 70 ? 'bad' : ''} style={{ width: `${((day.score || 0) / maxBias) * 100}%` }} /></div>
                <span className="mono">{day.score == null ? '—' : day.score}</span>
              </div>
            ))}
          </div>
        )}
        {report.bias.attributes.length > 0 && (
          <div className="pills" style={{ marginTop: 12 }}>
            {report.bias.attributes.map((group) => (
              <span key={group.attribute} className={`pill ${group.score >= 70 ? 'bad' : 'outline'}`}>
                {group.attribute} {group.score}
              </span>
            ))}
          </div>
        )}
      </div>

      <h2 className="section-title">Alerts, 24 hours</h2>
      <div className="card table-card">
        <table className="table">
          <thead><tr><th>When</th><th>Agent</th><th>Finding</th><th>Evidence</th></tr></thead>
          <tbody>
            {report.alerts.length === 0 && <tr><td colSpan={4}>No safety alerts in the last day.</td></tr>}
            {report.alerts.map((row) => (
              <tr key={row.id} className="clickable" onClick={() => navigate(`/agent/${row.agentId}`)}>
                <td className="muted">{formatWhen(row.createdAt)}</td>
                <td className="strong">{row.agentName}</td>
                <td><span className="pill bad">{LABELS[row.kind] || row.kind}</span></td>
                <td><div>{row.summary}</div><div className="muted">{row.evidence}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
