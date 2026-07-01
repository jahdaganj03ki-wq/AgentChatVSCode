import React, { useEffect } from 'react';
import { ChatView } from './ChatView';
import { Sidebar } from './Sidebar';
import { useChat } from '../context/ChatContext';
import { ExtensionMessage } from '../types';
import { getVsCodeApi } from '../vscode-api';

export function App() {
  const { state, dispatch } = useChat();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  useEffect(() => {
    getVsCodeApi().postMessage({ type: 'webview-ready' });

    const handler = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;
      switch (message.type) {
        case 'stream-chunk':
          dispatch({ type: 'APPEND_STREAM_CHUNK', content: message.content || '' });
          break;
        case 'stream-done':
          if (message.content) {
            dispatch({
              type: 'ADD_MESSAGE',
              message: {
                id: `assistant_${Date.now()}`,
                role: 'assistant',
                content: message.content,
                createdAt: new Date().toISOString(),
              },
            });
          }
          dispatch({ type: 'STREAM_DONE' });
          break;
        case 'stream-error':
          dispatch({ type: 'STREAM_DONE' });
          dispatch({
            type: 'ADD_MESSAGE',
            message: {
              id: `error_${Date.now()}`,
              role: 'system',
              content: `\u274C Error: ${message.error || 'Unknown error'}`,
              createdAt: new Date().toISOString(),
            },
          });
          break;
        case 'session-list':
          dispatch({ type: 'SET_SESSIONS', sessions: message.sessions || [] });
          break;
        case 'messages-load':
          dispatch({ type: 'SET_MESSAGES', messages: message.messages || [] });
          break;
        case 'settings':
          dispatch({ type: 'SET_SETTINGS', settings: message.settings! });
          break;
        case 'send-text':
          if (message.text) {
            dispatch({
              type: 'ADD_MESSAGE',
              message: {
                id: `user_${Date.now()}`,
                role: 'user',
                content: message.text,
                createdAt: new Date().toISOString(),
              },
            });
          }
          break;
        case 'skill-list':
          dispatch({ type: 'SET_SKILLS', skills: message.skills || [] });
          break;
        case 'skill-installed':
          // Skills will be refreshed via skill-list
          break;
        case 'skill-install-progress':
          dispatch({
            type: 'SET_SKILL_INSTALL_PROGRESS',
            progress: { name: message.name || '', status: message.status as any, message: message.error },
          });
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [dispatch]);

  return (
    <div className="app-container">
      {sidebarOpen && (
        <Sidebar
          sessions={state.sessions}
          onSelectSession={(id) => {
            dispatch({ type: 'SET_CURRENT_SESSION', sessionId: id });
            setSidebarOpen(false);
          }}
          onClose={() => setSidebarOpen(false)}
        />
      )}
      <ChatView onOpenSidebar={() => setSidebarOpen(true)} />
    </div>
  );
}
