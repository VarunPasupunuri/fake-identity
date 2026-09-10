import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('UI error', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="mb-3 h-10 w-10 text-amber-500" />
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-1 max-w-md text-sm muted">{String(this.state.error?.message || this.state.error)}</p>
        <button className="btn-primary mt-5" onClick={() => { this.setState({ error: null }); window.location.href = '/'; }}>Back to home</button>
      </div>
    );
  }
}
