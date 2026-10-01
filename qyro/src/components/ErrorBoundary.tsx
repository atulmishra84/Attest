import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { message: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: '' };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message || 'Something went wrong' };
  }

  render() {
    if (!this.state.message) return this.props.children;
    return (
      <div className="card">
        <h2 style={{ marginBottom: 8 }}>This page hit an error</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>{this.state.message}</p>
        <button className="btn primary" type="button" onClick={() => window.location.reload()} style={{ width: 'auto' }}>
          Reload
        </button>
      </div>
    );
  }
}
