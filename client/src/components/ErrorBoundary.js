import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#1e1f22', color: '#dbdee1',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
          <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.6 }}>⬡</div>
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Something went wrong</div>
            <div style={{ color: '#949ba4', fontSize: 14, marginBottom: 24 }}>
              An unexpected error occurred. Reloading usually fixes this.
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#5865f2', color: '#fff', border: 'none', borderRadius: 4,
                padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
