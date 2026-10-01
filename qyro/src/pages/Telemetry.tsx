import { useEffect, useState } from 'react';
import { api, formatWhen, type Page } from '../lib/api';

type EventRow = {
  id: number;
  agent_id: string;
  event_type: string;
  operation: string | null;
  resource: string | null;
  timestamp: string;
};

const WINDOWS = [
  { id: '1h', label: 'Last hour' },
  { id: '24h', label: 'Last day' },
  { id: '7d', label: 'Last 7 days' },
  { id: 'all', label: 'All time' },
];

export default function Telemetry() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [windowId, setWindowId] = useState('24h');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ pageSize: '50', q: submittedQuery });
    if (windowId !== 'all') params.set('since', windowId);
    api<Page<EventRow>>(`/api/telemetry/events?${params}`)
      .then((page) => {
        setEvents(page.items);
        setError('');
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load telemetry'))
      .finally(() => setLoading(false));
  }, [windowId, submittedQuery]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Behavior</div>
          <h1>Runtime Behavior</h1>
          <p className="lede">Recent calls ingested by the assurance engine.</p>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      <form className="toolbar" onSubmit={(event) => { event.preventDefault(); setLoading(true); setSubmittedQuery(query); }}>
        <select className="search" value={windowId} onChange={(event) => { setLoading(true); setWindowId(event.target.value); }}>
          {WINDOWS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <input className="search" value={query} placeholder="Filter by agent, operation, or resource" onChange={(event) => setQuery(event.target.value)} />
        <button className="btn primary" type="submit">Search</button>
      </form>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Agent</th>
              <th>Operation</th>
              <th>Resource</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4}><div className="skeleton" /></td></tr>}
            {!loading && events.length === 0 && <tr><td colSpan={4}>No runtime events in this window.</td></tr>}
            {!loading && events.map((event) => (
              <tr key={event.id}>
                <td>{formatWhen(event.timestamp)}</td>
                <td className="mono">{event.agent_id}</td>
                <td>{event.operation || event.event_type}</td>
                <td className="mono">{event.resource}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
