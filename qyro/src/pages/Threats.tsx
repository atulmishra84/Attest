import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatWhen, getToken, type ThreatFinding, type ThreatLedger } from '../lib/api';

const EMPTY: ThreatLedger = {
  generatedAt: '',
  interceptions: {
    promptInjection: { kind: 'PROMPT_INJECTION', total: 0, blocked: 0 },
    jailbreak: { kind: 'JAILBREAK', total: 0, blocked: 0 },
    systemPrompt: { kind: 'SYSTEM_PROMPT_EXTRACTION', total: 0, blocked: 0 },
  },
  output: [],
  volume: [],
  alerts: [],
};

const OUTPUT_LABELS: Record<string, string> = {
  MALICIOUS_CODE: 'Malicious code',
  TOXIC_OUTPUT: 'Toxic output',
  DATA_POISONING: 'Data poisoning',
  TOKEN_SPIKE: 'Token spike',
};

function LedgerTable({ rows, empty }: { rows: ThreatFinding[]; empty: string }) {
  const navigate = useNavigate();
  return (
    <div className="card table-card">
      <table className="table">
        <thead>
          <tr>
            <th>When</th>
            <th>Agent</th>
            <th>Finding</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4}>{empty}</td></tr>}
          {rows.map((row) => (
            <tr key={row.id} className="clickable" onClick={() => row.agentId && navigate(`/agent/${row.agentId}`)}>
              <td className="muted">{formatWhen(row.createdAt)}</td>
              <td className="strong">{row.agentName}</td>
              <td><span className="pill bad">{OUTPUT_LABELS[row.kind] || row.kind}</span></td>
              <td>
                <div>{row.summary}</div>
                <div className="muted">{row.evidence}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Threats() {
  const [ledger, setLedger] = useState<ThreatLedger>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next = await api<ThreatLedger>('/api/telemetry/ledger');
        if (!cancelled) {
          setLedger(next);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the ledger');
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

  const cards = [
    { label: 'Prompt injections blocked', metric: ledger.interceptions.promptInjection, tone: 'bad' },
    { label: 'Jailbreaks blocked', metric: ledger.interceptions.jailbreak, tone: 'bad' },
    { label: 'System prompt extraction blocked', metric: ledger.interceptions.systemPrompt, tone: 'warn' },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">SIEM for AI</div>
          <h1>Threat & Guardrail Ledger</h1>
          <p className="lede">Blocked attacks, unsafe model output, and token spikes from the last 24 hours. The ledger updates as calls arrive.</p>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}

      <h2 className="section-title">Adversarial interceptions</h2>
      <div className="grid grid-4" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 8 }}>
        {loading ? (
          Array.from({ length: 3 }, (_, index) => <div key={index} className="card stat"><div className="skeleton" /></div>)
        ) : cards.map((card) => (
          <div key={card.label} className={`card stat ${card.tone}`}>
            <span className="stat-label">{card.label}</span>
            <span className="stat-value">{card.metric.blocked}</span>
            <span className="stat-hint">{card.metric.total} seen</span>
          </div>
        ))}
      </div>

      <h2 className="section-title">Insecure output</h2>
      {loading ? <div className="card"><div className="skeleton" /></div> : (
        <LedgerTable
          rows={ledger.output}
          empty="No malicious code, toxic output, or data-poisoning flags in this window."
        />
      )}

      <h2 className="section-title">Anomalous volume</h2>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Tokens this hour</th>
              <th>Prior hour</th>
              <th>Alert</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4}><div className="skeleton" /></td></tr>}
            {!loading && ledger.volume.length === 0 && (
              <tr><td colSpan={4}>No token counts yet. Send tokens or usage.total_tokens with telemetry to watch for spikes.</td></tr>
            )}
            {!loading && ledger.volume.map((row) => (
              <tr key={row.agentId}>
                <td className="strong">{row.agentName}</td>
                <td className="mono">{row.tokens.toLocaleString()}</td>
                <td className="mono">{row.prior.toLocaleString()}</td>
                <td>{row.spike ? <span className="pill bad">Spike</span> : <span className="pill outline">Steady</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && ledger.alerts.length > 0 && (
        <LedgerTable rows={ledger.alerts} empty="" />
      )}
    </div>
  );
}
