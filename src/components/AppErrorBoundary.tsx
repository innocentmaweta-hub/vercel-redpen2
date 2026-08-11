import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Last-resort protection against an uncaught React render error taking down
 * the entire application with a blank screen. Normal UI is unaffected.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('RedPen application error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ marginBottom: 12 }}>RedPen needs to reload</h1>
          <p style={{ marginBottom: 20, lineHeight: 1.5 }}>
            An unexpected application error occurred. Your account and saved server data are not affected.
          </p>
          <button type="button" onClick={this.handleReload} style={{ padding: '10px 18px', cursor: 'pointer' }}>
            Reload RedPen
          </button>
        </div>
      </div>
    );
  }
}
