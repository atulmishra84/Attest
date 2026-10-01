import { useEffect, useState, type FormEvent } from 'react';
import { api, getStoredUser } from '../lib/api';

type Control = {
  id: string;
  name: string;
  intentDesc: string | null;
  requirementType: string;
};

type Framework = {
  id: string;
  name: string;
  description: string | null;
  controls: Control[];
};

export default function Policies() {
  const isAdmin = getStoredUser()?.role === 'ADMIN';
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [controlName, setControlName] = useState('');
  const [controlIntent, setControlIntent] = useState('');
  const [controlType, setControlType] = useState('DENY');
  const [targetFramework, setTargetFramework] = useState('');
  const [rego, setRego] = useState('');
  const [policyMessage, setPolicyMessage] = useState('');

  async function load() {
    const data = await api<Framework[]>('/api/frameworks');
    setFrameworks(data);
    const frameworkId = data[0]?.id || '';
    setTargetFramework((current) => current || frameworkId);
    if (frameworkId) {
      const policy = await api<{ rego: string }>(`/api/frameworks/${frameworkId}/policy`).catch(() => null);
      if (policy?.rego) setRego(policy.rego);
    }
  }

  useEffect(() => {
    load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load policies'))
      .finally(() => setLoading(false));
  }, []);

  async function createFramework(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api('/api/frameworks', {
        method: 'POST',
        body: JSON.stringify({ name, description }),
      });
      setName('');
      setDescription('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create framework');
    }
  }

  async function createControl(event: FormEvent) {
    event.preventDefault();
    if (!targetFramework) return;
    setError('');
    try {
      await api(`/api/frameworks/${targetFramework}/controls`, {
        method: 'POST',
        body: JSON.stringify({
          name: controlName,
          intentDesc: controlIntent,
          requirementType: controlType,
        }),
      });
      setControlName('');
      setControlIntent('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create control');
    }
  }

  return (
    <section>
      <h2 className="section-title">Policies</h2>
      <p className="muted">Frameworks, controls, and the Rego policy published to the engine. Admins can change them. Auditors can review them.</p>
      {loading && <div className="skeleton" />}
      {error && <div className="error-text">{error}</div>}

      <div className="grid" style={{ gap: 16, marginBottom: 32 }}>
        {frameworks.map((framework) => (
          <div key={framework.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{framework.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{framework.id}</div>
              </div>
              {framework.description && <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{framework.description}</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {framework.controls.map((control) => (
                <div key={control.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <span className="mono">{control.id}</span> · {control.name}
                    {control.intentDesc && (
                      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{control.intentDesc}</div>
                    )}
                  </div>
                  <span className={`pill ${control.requirementType === 'ALLOW' ? 'good' : 'bad'}`}>{control.requirementType}</span>
                </div>
              ))}
              {framework.controls.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No controls yet.</div>}
            </div>
          </div>
        ))}
      </div>

      {rego && (
        <form className="card" style={{ marginBottom: 24 }} onSubmit={async (event) => {
          event.preventDefault();
          if (!isAdmin) return;
          const frameworkId = frameworks[0]?.id;
          if (!frameworkId) return;
          try {
            await api(`/api/frameworks/${frameworkId}/policy`, {
              method: 'PUT',
              body: JSON.stringify({ rego }),
            });
            setPolicyMessage('Policy published to OPA.');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Policy rejected');
          }
        }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Rego policy</h2>
          <textarea className="search" style={{ minHeight: 180, width: '100%', fontFamily: 'var(--mono)' }} value={rego} readOnly={!isAdmin} onChange={(event) => setRego(event.target.value)} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{isAdmin ? policyMessage : 'Auditors can review the published policy.'}</span>
            {isAdmin && <button className="btn primary" type="submit" style={{ width: 'auto' }}>Publish policy</button>}
          </div>
        </form>
      )}

      {isAdmin && (
        <div className="grid grid-2">
          <form className="card" onSubmit={createFramework}>
            <h2 style={{ fontSize: 16, marginBottom: 16 }}>New framework</h2>
            <label className="field">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              Description
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <button className="btn primary" type="submit">Create framework</button>
          </form>
          <form className="card" onSubmit={createControl}>
            <h2 style={{ fontSize: 16, marginBottom: 16 }}>New control</h2>
            <label className="field">
              Framework
              <select value={targetFramework} onChange={(e) => setTargetFramework(e.target.value)} required>
                {frameworks.map((framework) => (
                  <option key={framework.id} value={framework.id}>{framework.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Name
              <input value={controlName} onChange={(e) => setControlName(e.target.value)} required />
            </label>
            <label className="field">
              Intent
              <input value={controlIntent} onChange={(e) => setControlIntent(e.target.value)} />
            </label>
            <label className="field">
              Requirement
              <select value={controlType} onChange={(e) => setControlType(e.target.value)}>
                <option value="DENY">DENY</option>
                <option value="ALLOW">ALLOW</option>
              </select>
            </label>
            <button className="btn primary" type="submit">Create control</button>
          </form>
        </div>
      )}
    </section>
  );
}
