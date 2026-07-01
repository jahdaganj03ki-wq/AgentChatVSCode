import React, { useState } from 'react';
import { useChat } from '../context/ChatContext';

interface Props {
  onClose: () => void;
}

export function SkillInstallDialog({ onClose }: Props) {
  const { state, installSkill } = useChat();
  const [source, setSource] = useState('');
  const [scope, setScope] = useState<'project' | 'global'>('project');

  const handleInstall = () => {
    if (!source.trim()) return;
    const name = source.split('/').pop() || source;
    installSkill(source.trim(), name, scope);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleInstall();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-widget-border)',
          borderRadius: '8px',
          padding: '20px',
          minWidth: '400px',
          maxWidth: '500px',
          boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
        }}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: '16px' }}>Install Skill</h3>

        <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
          Source (GitHub repo, URL, or npm package):
        </label>
        <input
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g., Lombiq/Orchard-Core-Agent-Skills"
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid var(--vscode-input-border)',
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            borderRadius: '4px',
            boxSizing: 'border-box',
            marginBottom: '12px',
          }}
        />

        <label style={{ display: 'block', marginBottom: '12px', fontSize: '12px' }}>
          Scope:
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'project' | 'global')}
            style={{
              marginLeft: '8px',
              padding: '4px',
              border: '1px solid var(--vscode-dropdown-border)',
              background: 'var(--vscode-dropdown-background)',
              color: 'var(--vscode-dropdown-foreground)',
              borderRadius: '4px',
            }}
          >
            <option value="project">Project (.apexagent/skills/)</option>
            <option value="global">Global (~/.apexagent/skills/)</option>
          </select>
        </label>

        {state.skillInstallProgress && (
          <div style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
            {state.skillInstallProgress.status === 'downloading' && 'Downloading...'}
            {state.skillInstallProgress.status === 'installing' && 'Installing...'}
            {state.skillInstallProgress.status === 'error' && `Error: ${state.skillInstallProgress.message}`}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="header-btn" style={{ padding: '6px 16px' }}>
            Cancel
          </button>
          <button
            onClick={handleInstall}
            className="header-btn"
            style={{ padding: '6px 16px', fontWeight: 600 }}
            disabled={!source.trim()}
          >
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
