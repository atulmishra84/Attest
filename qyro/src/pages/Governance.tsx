import { useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import Policies from './Policies';

type Citation = {
  citation: string;
  title: string;
  score: number | null;
  effective: number;
  violated: number;
  ineffective: number;
  other: number;
};

type FrameworkCard = {
  framework: string;
  score: number | null;
  effective: number;
  violated: number;
  ineffective: number;
  other: number;
  citations: Citation[];
};

type SpendRow = { name: string; tokens: number; usd: number; agents?: number; flag: string };

type AgenticRisk = {
  id: string;
  title: string;
  pass: number;
  fail: number;
  notAssessed: number;
  score: number | null;
  reason: string;
  agents: string[];
};

type GovernanceReport = {
  frameworks: FrameworkCard[];
  agentic?: {
    framework: string;
    score: number | null;
    agents: number;
    risks: AgenticRisk[];
  };
  spend: {
    window: string;
    ratePerMillion: number;
    totalTokens: number;
    estimatedUsd: number;
    departments: SpendRow[];
    keys: SpendRow[];
  };
};

function tone(score: number | null) {
  if (score == null) return 'unknown';
  if (score >= 80) return 'good';
  if (score >= 40) return 'warn';
  return 'bad';
}

export default function Governance() {
  const [report, setReport] = useState<GovernanceReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next = await api<GovernanceReport>('/api/reports/governance');
        if (!cancelled) {
          setReport(next);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load governance');
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

  const spend = report?.spend;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Regulatory and financial</div>
          <h1>Governance</h1>
          <p className="lede">Readiness against the EU AI Act, ISO/IEC 42001, the NIST AI RMF, and OWASP Agentic 2026, plus token spend and the policies those scores are judged against.</p>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}

      <h2 className="section-title">Compliance crosswalk</h2>
      <div className="grid grid-3">
        {(report?.frameworks || []).map((card) => (
          <section key={card.framework} className={`card stat ${tone(card.score)}`}>
            <div className="stat-label">{card.framework}</div>
            <div className="stat-value">{card.score == null ? '—' : `${card.score}%`}</div>
            <div className="stat-hint">{card.effective} effective · {card.violated} violated · {card.ineffective + card.other} not ready</div>
            <div className="stack" style={{ marginTop: 12 }}>
              {card.citations.map((cite) => (
                <div key={cite.citation}>
                  <div className="strong">{cite.citation}</div>
                  <div className="muted">{cite.title} · {cite.score == null ? 'not assessed' : `${cite.score}%`}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <h2 className="section-title">OWASP Agentic 2026</h2>
      <p className="muted">Each live agent is checked against the ten agentic risks. A pass means the evidence held. A gap means Attest does not have a sample for that risk yet.</p>
      <div className={`card stat ${tone(report?.agentic?.score ?? null)}`} style={{ marginBottom: 12 }}>
        <div className="stat-label">Agent validation</div>
        <div className="stat-value">{report?.agentic?.score == null ? '—' : `${report.agentic.score}%`}</div>
        <div className="stat-hint">{report?.agentic?.agents ?? 0} agents · score uses only risks that could be assessed</div>
      </div>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Risk</th>
              <th>Pass</th>
              <th>Fail</th>
              <th>Not assessed</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {(report?.agentic?.risks || []).map((risk) => (
              <tr key={risk.id}>
                <td>
                  <div className="strong">{risk.id}</div>
                  <div className="muted">{risk.title}</div>
                </td>
                <td className="mono">{risk.pass}</td>
                <td>{risk.fail ? <span className="pill bad">{risk.fail}</span> : <span className="mono">0</span>}</td>
                <td className="mono">{risk.notAssessed}</td>
                <td>
                  <div>{risk.reason}</div>
                  {risk.agents.length > 0 && <div className="muted">{risk.agents.join(', ')}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Cost and token analytics</h2>
      <div className="grid grid-3">
        <div className="card stat">
          <div className="stat-label">Tokens, 7 days</div>
          <div className="stat-value">{(spend?.totalTokens || 0).toLocaleString()}</div>
          <div className="stat-hint">Estimated ${spend?.estimatedUsd ?? 0} at ${spend?.ratePerMillion ?? 3} / 1M tokens</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Departments</div>
          <div className="stat-value">{spend?.departments.length ?? 0}</div>
          <div className="stat-hint">{spend?.departments.filter((row) => row.flag).length || 0} need a look</div>
        </div>
        <div className="card stat">
          <div className="stat-label">API keys</div>
          <div className="stat-value">{spend?.keys.length ?? 0}</div>
          <div className="stat-hint">{spend?.keys.filter((row) => row.flag).length || 0} above peer keys</div>
        </div>
      </div>

      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Department</th>
              <th>Agents</th>
              <th>Tokens</th>
              <th>Estimated</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {(spend?.departments || []).map((row) => (
              <tr key={row.name}>
                <td className="strong">{row.name}</td>
                <td className="mono">{row.agents}</td>
                <td className="mono">{row.tokens.toLocaleString()}</td>
                <td className="mono">${row.usd.toFixed(2)}</td>
                <td>{row.flag ? <span className="pill warn">{row.flag}</span> : <span className="pill outline">Steady</span>}</td>
              </tr>
            ))}
            {spend && spend.departments.length === 0 && (
              <tr><td colSpan={5}>No agents to attribute yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>API key</th>
              <th>Tokens</th>
              <th>Estimated</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {(spend?.keys || []).length === 0 && (
              <tr><td colSpan={4}>No key labels yet. Send api_key_name, or an api_key whose prefix is stored, with token counts.</td></tr>
            )}
            {(spend?.keys || []).map((row) => (
              <tr key={row.name}>
                <td className="mono">{row.name}</td>
                <td className="mono">{row.tokens.toLocaleString()}</td>
                <td className="mono">${row.usd.toFixed(2)}</td>
                <td>{row.flag ? <span className="pill bad">{row.flag}</span> : <span className="pill outline">Steady</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Policies />
    </div>
  );
}
