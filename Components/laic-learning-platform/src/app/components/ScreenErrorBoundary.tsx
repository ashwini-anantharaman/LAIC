import React from 'react';

type Props = { children: React.ReactNode; onReset?: () => void };

type State = { error: Error | null };

/** Keeps the shell (sidebar/top bar) alive when a screen throws. */
export class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ScreenErrorBoundary]', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
        <p style={{ fontSize: 15, fontWeight: 650, color: '#0B1220' }}>Something went wrong on this screen</p>
        <p style={{ fontSize: 13, color: '#6B7280', maxWidth: 420, lineHeight: 1.5 }}>
          {this.state.error.message || 'An unexpected error occurred.'}
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="mt-2 px-4 py-2 rounded-full text-white"
          style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}
        >
          Try again
        </button>
      </div>
    );
  }
}
