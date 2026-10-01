import { useEffect, useState, type FormEvent } from 'react';
import { api, formatWhen, getStoredUser } from '../lib/api';

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  role: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

const JOBS = [
  { name: 'capability-scan', label: 'Capability scan', hint: 'Refresh graphs and re-evaluate posture.' },
  { name: 'telemetry-digest', label: 'Telemetry digest', hint: 'Summarize calls from the last 24 hours.' },
  { name: 'stale-agent-check', label: 'Stale agent check', hint: 'Flag agents with no telemetry in 24 hours.' },
];

export default function Settings() {
  const isAdmin = getStoredUser()?.role === 'ADMIN';
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('90');
  const [createdSecret, setCreatedSecret] = useState('');
  const [runningJob, setRunningJob] = useState('');
  const [jobNote, setJobNote] = useState('');

  async function load() {
    setKeys(await api<ApiKeyRow[]>('/api/api-keys'));
  }

  useEffect(() => {
    load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load API keys'))
      .finally(() => setLoading(false));
  }, []);

  async function createKey(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const created = await api<ApiKeyRow & { secret: string }>('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name, expiresInDays: Number(expiresInDays) }),
      });
      setCreatedSecret(created.secret);
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    }
  }

  async function runJob(job: string) {
    setRunningJob(job);
    setJobNote('');
    setError('');
    try {
      const result = await api<{ job: string; result: unknown }>(`/api/jobs/${job}`, { method: 'POST' });
      setJobNote(`${result.job} finished. ${JSON.stringify(result.result)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Job failed');
    } finally {
      setRunningJob('');
    }
  }

  async function revoke(id: string) {
    setError('');
    try {
      await api(`/api/api-keys/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke API key');
    }
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Console</div>
          <h1>Settings</h1>
          <p className="lede">Integration keys for AgentRadar sync and telemetry. The secret is shown once.</p>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}
      {createdSecret && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Copy this key now. It will not be shown again.</div>
          <div className="code-block">{createdSecret}</div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Last used</th>
              <th>Expires</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} style={{ color: 'var(--text-muted)' }}>No active API keys.</td>
              </tr>
            )}
            {keys.map((key) => (
              <tr key={key.id}>
                <td style={{ fontWeight: 600 }}>{key.name}</td>
                <td className="mono">{key.keyPrefix}…</td>
                <td>{key.lastUsedAt ? formatWhen(key.lastUsedAt) : 'Never'}</td>
                <td>{key.expiresAt ? formatWhen(key.expiresAt) : 'None'}</td>
                {isAdmin && (
                  <td>
                    <button className="btn ghost" type="button" onClick={() => revoke(key.id)}>Revoke</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <section className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Run a scan</h2>
          <p className="muted" style={{ marginBottom: 16 }}>These jobs also run on a schedule. Run now when you need a fresh posture.</p>
          <div className="grid grid-3">
            {JOBS.map((job) => (
              <button key={job.name} className="btn ghost" type="button" disabled={runningJob !== ''} onClick={() => runJob(job.name)}>
                {runningJob === job.name ? 'Running…' : job.label}
              </button>
            ))}
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            {JOBS.map((job) => <div key={job.name} className="muted">{job.hint}</div>)}
          </div>
          {jobNote && <div className="code-block" style={{ marginTop: 12 }}>{jobNote}</div>}
        </section>
      )}

      {isAdmin && (
        <form className="card login-card" onSubmit={createKey}>
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>Issue integration key</h2>
          <label className="field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            Expires in days
            <input type="number" min="1" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} />
          </label>
          <button className="btn primary" type="submit">Create key</button>
        </form>
      )}
    </div>
  );
}
