import { useEffect, useState } from 'react';
import { api, downloadFile, formatWhen, type EvidencePack } from '../lib/api';

function pillClass(state: string) {
  if (state === 'EFFECTIVE') return 'good';
  if (state === 'VIOLATED' || state === 'BLOCKED_VIOLATION') return 'bad';
  if (state === 'INEFFECTIVE') return 'warn';
  return 'unknown';
}

export default function Evidence() {
  const [pack, setPack] = useState<EvidencePack | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<EvidencePack>('/api/reports/evidence')
      .then((result) => setPack(result))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load evidence pack'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Audit</div>
          <h1>Evidence Pack</h1>
          <p className="lede">
            Each control mapped to HIPAA, NIST AI RMF, and OWASP, with the state and the call behind it.
            {pack ? ` Generated ${formatWhen(pack.generatedAt)}.` : ''}
          </p>
        </div>
        <div className="actions">
          <button className="btn ghost" type="button" onClick={() => downloadFile('/api/reports/evidence.csv', 'attest-evidence-pack.csv')}>
            Export CSV
          </button>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      {pack && pack.quarantined.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="section-title">Quarantined agents</div>
          <div className="pills">
            {pack.quarantined.map((agent) => <span key={agent.id} className="pill bad">{agent.name}</span>)}
          </div>
        </div>
      )}
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Control</th>
              <th>State</th>
              <th>Framework</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5}><div className="skeleton" /></td></tr>}
            {!loading && pack?.controls.length === 0 && <tr><td colSpan={5}>No control results to pack yet.</td></tr>}
            {pack?.controls.map((row) => (
              <tr key={`${row.agentId}-${row.controlId}`}>
                <td>
                  <div className="strong">{row.agentName}</div>
                  {row.status === 'Quarantined' && <span className="pill bad">Quarantined</span>}
                </td>
                <td><span className="mono">{row.controlId}</span> · {row.controlName}</td>
                <td><span className={`pill ${pillClass(row.state)}`}>{row.state}</span></td>
                <td>
                  <div className="stack">
                    {row.citations.map((item) => (
                      <span key={`${item.framework}-${item.citation}`}>{item.framework} {item.citation}</span>
                    ))}
                  </div>
                </td>
                <td className="muted">{row.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
