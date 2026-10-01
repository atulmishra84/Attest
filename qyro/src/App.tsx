import { useEffect, useState, type FormEvent } from 'react';
import { BrowserRouter as Router, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import AgentDetails from './pages/AgentDetails';
import SettingsPage from './pages/Settings';
import Discovery from './pages/Discovery';
import Telemetry from './pages/Telemetry';
import Threats from './pages/Threats';
import Privacy from './pages/Privacy';
import Governance from './pages/Governance';
import Safety from './pages/Safety';
import IntellectualProperty from './pages/IntellectualProperty';
import ModelHealth from './pages/ModelHealth';
import Evidence from './pages/Evidence';
import { ErrorBoundary } from './components/ErrorBoundary';
import { api, clearSession, getStoredUser, getToken, saveSession, type AuthUser } from './lib/api';

const SECTIONS = [
  {
    heading: 'Assurance',
    items: [
      { to: '/', label: 'Control Assurance' },
      { to: '/evidence', label: 'Evidence Pack' },
      { to: '/governance', label: 'Governance' },
    ],
  },
  {
    heading: 'Inventory',
    items: [{ to: '/discovery', label: 'Agent Discovery' }],
  },
  {
    heading: 'Activity',
    items: [
      { to: '/telemetry', label: 'Runtime Behavior' },
      { to: '/threats', label: 'Threat Ledger' },
      { to: '/privacy', label: 'Data Privacy' },
    ],
  },
  {
    heading: 'Safety',
    items: [
      { to: '/safety', label: 'Safety & Ethics' },
      { to: '/ip', label: 'IP Protection' },
      { to: '/ops', label: 'Model Health' },
    ],
  },
  {
    heading: 'Settings',
    items: [{ to: '/settings', label: 'Settings' }],
  },
];

function linkActive(path: string, current: string) {
  if (path === '/') return current === '/' || current.startsWith('/agent/');
  return current === path || current.startsWith(`${path}/`);
}

function Shell({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');
  const [health, setHealth] = useState<{ db: string; redis: string; opa: string } | null>(null);
  const [live, setLive] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(SECTIONS.map((section) => [section.heading, true])));

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
      api<{ connected?: boolean }>('/api/integration/visentra/status')
        .then((feed) => { if (!cancelled) setLive(Boolean(feed.connected)); })
        .catch(() => { if (!cancelled) setLive(false); });
    }
    tick();
    const timer = window.setInterval(tick, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  function chooseTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('attest_theme', next);
    setTheme(next);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const q = search.trim();
    navigate(q ? `/discovery?q=${encodeURIComponent(q)}` : '/discovery');
  }

  const dot = (state?: string) => (state === 'connected' ? 'live' : 'error');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">AT</div>
          <div>
            <div className="brand-title">Attest</div>
            <div className="brand-subtitle">Assurance</div>
          </div>
        </div>
        <nav aria-label="Primary navigation">
          {SECTIONS.map((section) => (
            <div className={`nav-section ${open[section.heading] ? 'open' : 'collapsed'}`} key={section.heading}>
              <button
                type="button"
                className="nav-heading-button"
                aria-expanded={open[section.heading]}
                onClick={() => setOpen((current) => ({ ...current, [section.heading]: !current[section.heading] }))}
              >
                <span>{section.heading}</span>
                <span className={`nav-chevron ${open[section.heading] ? 'open' : ''}`} aria-hidden="true" />
              </button>
              <div className="nav-panel" hidden={!open[section.heading]}>
                {section.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`nav-link ${linkActive(item.to, location.pathname) ? 'active' : ''}`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user" title={user.email}>{user.email}</div>
          <button className="button ghost" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <form className="search-box" onSubmit={submitSearch}>
            <span aria-hidden="true">⌕</span>
            <input aria-label="Search agents" placeholder="Search agents…" value={search} onChange={(event) => setSearch(event.target.value)} />
            <kbd>/</kbd>
          </form>
          <div className="toolbar">
            <button className="theme-toggle" type="button" onClick={chooseTheme}>
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
            <span className="status-pill">
              <span className={`status-dot ${live ? 'live' : 'warn'}`} />
              {live ? 'Live' : 'Feed idle'}
            </span>
            <span className="status-pill"><span className={`status-dot ${dot(health?.db)}`} /> Database</span>
            <span className="status-pill"><span className={`status-dot ${dot(health?.redis)}`} /> Redis</span>
            <span className="status-pill"><span className={`status-dot ${dot(health?.opa)}`} /> Policy</span>
          </div>
        </header>
        <div className="page">
          <Routes>
            <Route path="/" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="/agent/:id" element={<ErrorBoundary><AgentDetails /></ErrorBoundary>} />
            <Route path="/discovery" element={<ErrorBoundary><Discovery /></ErrorBoundary>} />
            <Route path="/telemetry" element={<ErrorBoundary><Telemetry /></ErrorBoundary>} />
            <Route path="/threats" element={<ErrorBoundary><Threats /></ErrorBoundary>} />
            <Route path="/privacy" element={<ErrorBoundary><Privacy /></ErrorBoundary>} />
            <Route path="/governance" element={<ErrorBoundary><Governance /></ErrorBoundary>} />
            <Route path="/safety" element={<ErrorBoundary><Safety /></ErrorBoundary>} />
            <Route path="/ip" element={<ErrorBoundary><IntellectualProperty /></ErrorBoundary>} />
            <Route path="/ops" element={<ErrorBoundary><ModelHealth /></ErrorBoundary>} />
            <Route path="/evidence" element={<ErrorBoundary><Evidence /></ErrorBoundary>} />
            <Route path="/policies" element={<Navigate to="/governance" replace />} />
            <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
            <Route path="*" element={<div><h2>Not found</h2><p className="muted">That module is not on this console.</p></div>} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function Login({ onSuccess }: { onSuccess: (user: AuthUser) => void }) {
  const [email, setEmail] = useState('admin@qyro.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');

  function chooseTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('attest_theme', next);
    setTheme(next);
  }

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
    <div className="login-page">
      <button className="theme-toggle login-theme-toggle" type="button" onClick={chooseTheme}>
        {theme === 'light' ? 'Dark' : 'Light'}
      </button>
      <section className="login-hero">
        <div className="brand-lockup">
          <div className="brand-mark">AT</div>
          <div>
            <div className="brand-title">Attest</div>
            <div className="brand-subtitle">Assurance</div>
          </div>
        </div>
        <div>
          <h1>Control assurance for every agent.</h1>
          <p className="page-description">See which controls hold, which permissions drifted, and what the agent actually did.</p>
        </div>
      </section>
      <div className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="eyebrow">Sign in</div>
          <h2>Welcome back</h2>
          {error && <div className="error-state">{error}</div>}
          <label className="field">
            Email
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            Password
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button className="button primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
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
      <Shell user={user} onSignOut={signOut} />
    </Router>
  );
}

export default App;
