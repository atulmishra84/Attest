import { useEffect, useState, type FormEvent } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Shield, Activity, Database, Settings, Search, ShieldAlert, FileText } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import AgentDetails from './pages/AgentDetails';
import Policies from './pages/Policies';
import SettingsPage from './pages/Settings';
import Discovery from './pages/Discovery';
import Telemetry from './pages/Telemetry';
import Threats from './pages/Threats';
import Evidence from './pages/Evidence';
import { ErrorBoundary } from './components/ErrorBoundary';
import { api, clearSession, getStoredUser, getToken, saveSession, type AuthUser } from './lib/api';

function HealthStrip() {
  const [health, setHealth] = useState<{ db: string; redis: string; opa: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const response = await fetch('/api/health');
        const report = await response.json();
        if (!cancelled) setHealth(report);
      } catch {
        if (!cancelled) setHealth({ db: 'disconnected', redis: 'disconnected', opa: 'disconnected' });
      }
    }
    tick();
    const timer = window.setInterval(tick, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const dot = (state?: string) => (state === 'connected' ? 'up' : 'down');
  return (
    <div className="health-strip">
      <span><i className={`dot ${dot(health?.db)}`} /> Database</span>
      <span><i className={`dot ${dot(health?.redis)}`} /> Redis</span>
      <span><i className={`dot ${dot(health?.opa)}`} /> Policy engine</span>
    </div>
  );
}

function Sidebar({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const location = useLocation();
  const navItems = [
    { path: '/', icon: <Shield size={18} />, label: 'Control Assurance' },
    { path: '/discovery', icon: <Search size={18} />, label: 'Agent Discovery' },
    { path: '/telemetry', icon: <Activity size={18} />, label: 'Runtime Behavior' },
    { path: '/threats', icon: <ShieldAlert size={18} />, label: 'Threats' },
    { path: '/evidence', icon: <FileText size={18} />, label: 'Evidence Pack' },
    { path: '/policies', icon: <Database size={18} />, label: 'Governance Policies' },
    { path: '/settings', icon: <Settings size={18} />, label: 'Settings' },
  ];

  const activePath = location.pathname.startsWith('/agent/') ? '/' : location.pathname;

  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <span className="mark">A</span>
        <span className="brand-copy">
          Attest
          <small>Assurance</small>
        </span>
      </div>
      <div className="nav-label">Console</div>
      <nav>
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-item ${activePath === item.path ? 'active' : ''}`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
      <HealthStrip />
      <div className="sidebar-footer">
        <div className="user-name">{user.name}</div>
        <div className="user-email">{user.email}</div>
        <button className="btn ghost" type="button" onClick={onSignOut}>Sign out</button>
      </div>
    </div>
  );
}

function Login({ onSuccess }: { onSuccess: (user: AuthUser) => void }) {
  const [email, setEmail] = useState('admin@qyro.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await api<{ token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      saveSession(result.token, result.user);
      onSuccess(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <section className="login-hero">
        <div className="sidebar-brand" style={{ padding: 0 }}>
          <span className="mark">A</span>
          <span className="brand-copy">Attest<small>Assurance</small></span>
        </div>
        <div>
          <h1>Control assurance for every agent.</h1>
          <p>See which controls hold, which permissions drifted, and what the agent actually did.</p>
        </div>
      </section>
      <div className="login-panel">
        <form className="card login-card" onSubmit={handleSubmit}>
          <div className="eyebrow">Sign in</div>
          <h2 style={{ fontSize: 28, letterSpacing: '-0.04em', marginBottom: 18 }}>Welcome back</h2>
          {error && <div className="error-text">{error}</div>}
          <label className="field">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button className="btn primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(() => (getToken() ? getStoredUser() : null));

  useEffect(() => {
    if (!getToken()) return;
    api<AuthUser>('/api/auth/me')
      .then((current) => {
        const token = getToken();
        if (!token) return;
        saveSession(token, current);
        setUser(current);
      })
      .catch(() => undefined);
  }, []);

  function signOut() {
    clearSession();
    setUser(null);
  }

  if (!user) {
    return <Login onSuccess={setUser} />;
  }

  return (
    <Router>
      <div className="app-container">
        <Sidebar user={user} onSignOut={signOut} />
        <main className="main-content">
          <div className="page">
          <Routes>
            <Route path="/" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="/agent/:id" element={<ErrorBoundary><AgentDetails /></ErrorBoundary>} />
            <Route path="/discovery" element={<ErrorBoundary><Discovery /></ErrorBoundary>} />
            <Route path="/telemetry" element={<ErrorBoundary><Telemetry /></ErrorBoundary>} />
            <Route path="/threats" element={<ErrorBoundary><Threats /></ErrorBoundary>} />
            <Route path="/evidence" element={<ErrorBoundary><Evidence /></ErrorBoundary>} />
            <Route path="/policies" element={<ErrorBoundary><Policies /></ErrorBoundary>} />
            <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
            <Route path="*" element={<div><h2>Not found</h2><p>That module is not on this console.</p></div>} />
          </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
}

export default App;
