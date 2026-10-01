import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatWhen, getToken } from '../lib/api';

type Finding = { id: string; agentId: string; agentName: string; kind: string; summary: string; evidence: string; createdAt: string };
type IpReport = {
  proximityAt: number;
  counts: { copyleft: number; proximity: number; trademark: number };
  findings: Finding[];
};

const EMPTY: IpReport = { proximityAt: 55, counts: { copyleft: 0, proximity: 0, trademark: 0 }, findings: [] };

const LABELS: Record<string, string> = {
  COPYLEFT_LICENSE: 'Copyleft license',
  COPYRIGHT_PROXIMITY: 'Copyright proximity',
  TRADEMARK: 'Trademark',
};

export default function IntellectualProperty() {
  const navigate = useNavigate();
  const [report, setReport] = useState<IpReport>(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next = await api<IpReport>('/api/telemetry/ip');
        if (!cancelled) {
          setReport(next);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load IP protection');
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
          <div className="eyebrow">Legal and intellectual property</div>
          <h1>IP Protection</h1>
          <p className="lede">Copyleft notices in generated code, and output that sits too close to a copyrighted, patented, or trademarked reference supplied with the call. A match blocks the gate before the text is released.</p>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}

      <div className="grid grid-3">
        <div className="card stat bad"><div className="stat-label">Copyleft notices, 7d</div><div className="stat-value">{report.counts.copyleft}</div><div className="stat-hint">GPL, AGPL, LGPL, EUPL, MPL, SSPL</div></div>
        <div className="card stat warn"><div className="stat-label">Copyright proximity, 7d</div><div className="stat-value">{report.counts.proximity}</div><div className="stat-hint">Alert at {report.proximityAt} against a supplied reference</div></div>
        <div className="card stat warn"><div className="stat-label">Trademarks, 7d</div><div className="stat-value">{report.counts.trademark}</div><div className="stat-hint">Marks sent with the call</div></div>
      </div>

      <div className="card table-card">
        <table className="table">
          <thead><tr><th>When</th><th>Agent</th><th>Finding</th><th>Evidence</th></tr></thead>
          <tbody>
            {report.findings.length === 0 && (
              <tr><td colSpan={4}>No license or proximity flags yet. Code output is scanned for copyleft notices. Proximity runs when the call includes a reference text or a copyright score.</td></tr>
            )}
            {report.findings.map((row) => (
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
