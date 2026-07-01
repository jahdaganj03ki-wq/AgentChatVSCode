import React from 'react';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { useChat } from '../context/ChatContext';
import { SkillSelector } from './SkillSelector';
import { postMessage } from '../vscode-api';

interface ChatViewProps {
  onOpenSidebar: () => void;
}

export function ChatView({ onOpenSidebar }: ChatViewProps) {
  const { state } = useChat();

  return (
    <>
      <div className="header">
        <button className="header-btn" onClick={onOpenSidebar} title="Sessions">
          &#8592; Sessions
        </button>
        <SkillSelector />
        <select className="header-select" value={state.settings?.defaultProvider || ''} onChange={(e) => postMessage({ type: 'set-provider', providerId: e.target.value })}>
          {state.settings?.providers
            .filter((p) => p.enabled)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
          {state.settings?.providers.find((p) => p.id === state.settings?.defaultProvider)?.model || ''}
        </span>
        <div style={{ flex: 1 }} />
        <button className="header-btn" onClick={() => postMessage({ type: 'new-chat' })} title="New Chat">
          +
        </button>
      </div>
      <MessageList
        messages={state.messages}
        streamingContent={state.streamingContent}
        isStreaming={state.isStreaming}
      />
      <InputArea />
      <div className="footer">
        <span>{state.settings?.providers.find((p) => p.id === state.settings?.defaultProvider)?.name || ''}</span>
        <span>{state.messages.length} messages</span>
      </div>
    </>
  );
}
