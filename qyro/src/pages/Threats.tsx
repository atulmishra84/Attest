import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatWhen, type ThreatFinding } from '../lib/api';

const KINDS = [
  { id: 'all', label: 'All' },
  { id: 'PROMPT_INJECTION', label: 'Prompt injection' },
  { id: 'TOOL_MISUSE', label: 'Tool misuse' },
  { id: 'SENSITIVE_DISCLOSURE', label: 'Sensitive data' },
];

function kindLabel(kind: string) {
  return KINDS.find((item) => item.id === kind)?.label || kind;
}

export default function Threats() {
  const navigate = useNavigate();
  const [findings, setFindings] = useState<ThreatFinding[]>([]);
  const [kind, setKind] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (kind !== 'all') params.set('kind', kind);
    api<ThreatFinding[]>(`/api/telemetry/threats?${params}`)
      .then((rows) => {
        setFindings(rows);
        setError('');
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load threats'))
      .finally(() => setLoading(false));
  }, [kind]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">AI security</div>
          <h1>Threats</h1>
          <p className="lede">Prompt injection, tool misuse, and sensitive data on the path the agent actually took.</p>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      <div className="chips" style={{ marginBottom: 22 }}>
        {KINDS.map((item) => (
          <button key={item.id} className={`chip ${kind === item.id ? 'active' : ''}`} type="button" onClick={() => { setLoading(true); setKind(item.id); }}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Agent</th>
              <th>Threat</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4}><div className="skeleton" /></td></tr>}
            {!loading && findings.length === 0 && (
              <tr><td colSpan={4}>No findings of this kind. Prompt injection appears when telemetry includes the prompt.</td></tr>
            )}
            {!loading && findings.map((finding) => (
              <tr key={finding.id} className="clickable" onClick={() => finding.agentId && navigate(`/agent/${finding.agentId}`)}>
                <td className="muted">{formatWhen(finding.createdAt)}</td>
                <td className="strong">{finding.agentName}</td>
                <td><span className="pill bad">{kindLabel(finding.kind)}</span></td>
                <td>
                  <div>{finding.summary}</div>
                  <div className="muted">{finding.evidence}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
