import React, { useEffect, useState } from 'react';
import { AppSettings } from '../types';
import { getVsCodeApi } from '../vscode-api';

function sendMessage(msg: any) {
  getVsCodeApi().postMessage(msg);
}
type TestResult = { success: boolean; latencyMs?: number; error?: string };

export function SettingsApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult | null>>({});
  const [models, setModels] = useState<Record<string, any[]>>({});

  useEffect(() => {
    const handler = (event: MessageEvent<any>) => {
      const message = event.data;
      switch (message.type) {
        case 'settings':
          setSettings(message.settings);
          break;
        case 'test-result':
          setTestResults((prev) => ({ ...prev, [message.providerId]: message.result }));
          break;
        case 'model-list':
          setModels((prev) => ({ ...prev, [message.providerId]: message.models }));
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleSaveApiKey = (providerId: string) => {
    const key = apiKeys[providerId];
    if (!key) return;
    sendMessage({ type: 'save-api-key', providerId, apiKey: key });
  };

  const handleTestConnection = (providerId: string) => {
    setTestResults((prev) => ({ ...prev, [providerId]: null }));
    sendMessage({ type: 'test-connection', providerId });
  };

  const handleFetchModels = (providerId: string) => {
    sendMessage({ type: 'fetch-models', providerId });
  };

  if (!settings) {
    return <div style={{ padding: 24 }}>Loading settings...</div>;
  }

  return (
    <div style={{ padding: '16px 24px', maxWidth: 640, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 20, fontSize: '1.3em' }}>ApexAgent Settings</h2>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 12, fontSize: '1.1em', borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: 8 }}>
          General
        </h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>Default Provider</label>
          <select
            className="header-select"
            value={settings.defaultProvider}
            onChange={(e) => {
              const updated = { ...settings, defaultProvider: e.target.value };
              setSettings(updated);
              sendMessage({ type: 'update-settings', defaultProvider: e.target.value });
            }}
            style={{ width: '100%' }}
          >
            {settings.providers.filter((p) => p.enabled).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>System Prompt</label>
          <textarea
            style={{
              width: '100%',
              minHeight: 80,
              background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-input-border)',
              borderRadius: 4,
              padding: 8,
              fontFamily: 'var(--vscode-font-family)',
              fontSize: 'var(--vscode-font-size)',
            }}
            defaultValue={settings.systemPrompt}
            onBlur={(e) => {
              sendMessage({ type: 'update-settings', systemPrompt: e.target.value });
            }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>Session Limit</label>
          <select
            className="header-select"
            defaultValue={50}
            onChange={(e) => sendMessage({ type: 'update-settings', sessionLimit: parseInt(e.target.value) })}
            style={{ width: '100%' }}
          >
            <option value={50}>50 sessions</option>
            <option value={100}>100 sessions</option>
            <option value={500}>500 sessions</option>
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>Log Level</label>
          <select
            className="header-select"
            value="info"
            onChange={(e) => sendMessage({ type: 'update-settings', logLevel: e.target.value })}
            style={{ width: '100%' }}
          >
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="none">None</option>
          </select>
        </div>
      </section>

      <section>
        <h3 style={{ marginBottom: 12, fontSize: '1.1em', borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: 8 }}>
          Providers
        </h3>
        {settings.providers.map((provider) => (
          <div
            key={provider.id}
            style={{
              marginBottom: 16,
              padding: 12,
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: 6,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong>{provider.name}</strong>
              <span style={{ fontSize: '0.8em', color: 'var(--vscode-descriptionForeground)' }}>
                {provider.baseUrl}
              </span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', marginBottom: 2, fontSize: '0.85em' }}>API Key</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  placeholder="Enter API key..."
                  style={{
                    flex: 1,
                    background: 'var(--vscode-input-background)',
                    color: 'var(--vscode-input-foreground)',
                    border: '1px solid var(--vscode-input-border)',
                    borderRadius: 4,
                    padding: '6px 8px',
                  }}
                  onChange={(e) => setApiKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                />
                <button
                  className="send-btn"
                  onClick={() => handleSaveApiKey(provider.id)}
                  disabled={!apiKeys[provider.id]}
                  style={{ whiteSpace: 'nowrap', fontSize: 12, padding: '6px 12px', height: 'auto' }}
                >
                  Save Key
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button
                className="send-btn"
                onClick={() => handleTestConnection(provider.id)}
                style={{ fontSize: 12, padding: '4px 12px', height: 'auto' }}
              >
                Test Connection
              </button>
              <button
                className="send-btn"
                onClick={() => handleFetchModels(provider.id)}
                style={{ fontSize: 12, padding: '4px 12px', height: 'auto' }}
              >
                Fetch Models
              </button>
            </div>
            {testResults[provider.id] && (
              <div style={{ fontSize: '0.85em', marginTop: 4 }}>
                {testResults[provider.id]!.success ? (
                  <span style={{ color: 'var(--vscode-testing-iconPassedForeground)' }}>
                    Connected ({testResults[provider.id]!.latencyMs}ms)
                  </span>
                ) : (
                  <span style={{ color: 'var(--vscode-errorForeground)' }}>
                    Failed: {testResults[provider.id]!.error}
                  </span>
                )}
              </div>
            )}
            {models[provider.id] && models[provider.id].length > 0 && (
              <div style={{ fontSize: '0.85em', marginTop: 4 }}>
                <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
                  {models[provider.id].length} models available
                </span>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
