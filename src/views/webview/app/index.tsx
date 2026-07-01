import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ChatProvider } from './context/ChatContext';
import './styles/global.css';

const container = document.getElementById('root');

window.onerror = (message, source, lineno, colno, error) => {
  if (container) {
    container.innerHTML = `<pre style="color:#f44;padding:16px;white-space:pre-wrap;font-size:12px;">[window.onerror] ${String(message)}\n${source}:${lineno}:${colno}\n${error?.stack || ''}</pre>`;
  }
  console.error('[ApexAgent] window.onerror:', message, source, lineno, colno, error);
  return true;
};

window.onunhandledrejection = (event) => {
  if (container) {
    container.innerHTML = `<pre style="color:#f44;padding:16px;white-space:pre-wrap;font-size:12px;">[unhandledrejection] ${event.reason?.stack || event.reason}</pre>`;
  }
  console.error('[ApexAgent] unhandledrejection:', event.reason);
};

if (container) {
  container.innerHTML = '<div style="padding:16px;color:var(--vscode-descriptionForeground);">Loading ApexAgent...</div>';

  try {
    const root = createRoot(container);
    root.render(
      <ErrorBoundary>
        <ChatProvider>
          <App />
        </ChatProvider>
      </ErrorBoundary>
    );
  } catch (err) {
    container.innerHTML = `<pre style="color:#f44;padding:16px;white-space:pre-wrap;font-size:12px;">[render error] ${err instanceof Error ? err.stack : String(err)}</pre>`;
    console.error('[ApexAgent] render error:', err);
  }
}
