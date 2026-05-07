import React from 'react';

// Extract a human-readable component name from the componentStack string
function extractComponentName(componentStack = '') {
  const match = componentStack.trim().match(/^\s*at\s+(\w+)/);
  return match ? match[1] : null;
}

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, componentName: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const componentName = extractComponentName(info?.componentStack || '');
    this.setState({ componentName });
    console.error('[BotSquad] Uncaught error in', componentName || 'unknown component', ':', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const { error, componentName } = this.state;
      const pageName = this.props.pageName || componentName || null;
      return (
        <div style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#030712',
          color: '#f3f4f6',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
            {pageName ? `Erro em ${pageName}` : 'Algo deu errado'}
          </h2>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24, maxWidth: 320, lineHeight: 1.5 }}>
            {error?.message || 'Erro inesperado. Tente recarregar a página.'}
          </p>
          <button
            onClick={() => { this.setState({ error: null, componentName: null }); window.location.reload(); }}
            style={{
              background: '#4f6ef7',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '10px 24px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}>
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
