import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ApexAgent] ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 16,
          color: 'var(--vscode-errorForeground, #f44)',
          fontFamily: 'var(--vscode-editor-font-family, monospace)',
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          overflow: 'auto',
          height: '100%',
        }}>
          <strong>ApexAgent Error</strong>
          <br />
          <br />
          {this.state.error?.message || 'Unknown error'}
          <br />
          <br />
          {this.state.error?.stack && (
            <details>
              <summary style={{ cursor: 'pointer', marginBottom: 8 }}>Stack trace</summary>
              <pre style={{ margin: 0, fontSize: 11 }}>{this.state.error.stack}</pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
