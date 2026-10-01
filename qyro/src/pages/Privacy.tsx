import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken } from '../lib/api';

type Category = { id: string; label: string; count: number };
type Hour = { index: number; name: number; ssn: number; source_code: number; financial: number };
type Flag = {
  agentId: string;
  agentName: string;
  dataClasses: string[];
  stores: Array<{ name: string; kind: string }>;
  reasons: string[];
};
type PrivacyReport = {
  categories: Category[];
  hours: Hour[];
  oversharing: Flag[];
};

const EMPTY: PrivacyReport = { categories: [], hours: [], oversharing: [] };

function heat(count: number, max: number) {
  if (!count || !max) return 'heat-0';
  const ratio = count / max;
  if (ratio > 0.66) return 'heat-3';
  if (ratio > 0.33) return 'heat-2';
  return 'heat-1';
}

export default function Privacy() {
  const navigate = useNavigate();
  const [report, setReport] = useState<PrivacyReport>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next = await api<PrivacyReport>('/api/telemetry/privacy');
        if (!cancelled) {
          setReport(next);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load privacy monitoring');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const token = getToken();
    if (!token) return () => { cancelled = true; };
    const source = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
    source.addEventListener('telemetry', () => load());
    source.addEventListener('decision', () => load());
    return () => {
      cancelled = true;
      source.close();
    };
  }, []);

  const maxCount = Math.max(1, ...report.categories.map((category) => category.count));

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Data movement</div>
          <h1>Data Privacy & DLP</h1>
          <p className="lede">What the proxy masked before a public model saw it, and which RAG stores are open without authorization.</p>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}

      <h2 className="section-title">Redaction heatmap</h2>
      <div className="heatmap">
        {(loading ? [] : report.categories).map((category) => (
          <div key={category.id} className={`heat-card ${heat(category.count, maxCount)}`}>
            <div className="stat-label">{category.label}</div>
            <div className="stat-value">{category.count}</div>
            <div className="stat-hint">masked in 24 hours</div>
            <div className="heat-strip" aria-hidden="true">
              {report.hours.map((hour) => {
                const value = hour[category.id as keyof Hour] as number;
                const hourMax = Math.max(1, ...report.hours.map((item) => item[category.id as keyof Hour] as number));
                return <i key={hour.index} className={heat(value, hourMax)} title={`${value} masked`} />;
              })}
            </div>
          </div>
        ))}
        {loading && Array.from({ length: 4 }, (_, index) => <div key={index} className="heat-card"><div className="skeleton" /></div>)}
      </div>

      <h2 className="section-title">Oversharing and access posture</h2>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Store</th>
              <th>Data class</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4}><div className="skeleton" /></td></tr>}
            {!loading && report.oversharing.length === 0 && (
              <tr><td colSpan={4}>No unauthorized RAG stores. Sensitive collections with an owner and no excess tool stay off this list.</td></tr>
            )}
            {!loading && report.oversharing.map((flag) => (
              <tr key={flag.agentId} className="clickable" onClick={() => navigate(`/agent/${flag.agentId}`)}>
                <td className="strong">{flag.agentName}</td>
                <td>{flag.stores.length ? flag.stores.map((store) => store.name).join(', ') : 'No named vector store'}</td>
                <td>{flag.dataClasses.length ? flag.dataClasses.join(', ') : '—'}</td>
                <td>
                  {flag.reasons.map((reason) => <div key={reason} className="pill warn" style={{ margin: '2px 6px 2px 0' }}>{reason}</div>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
