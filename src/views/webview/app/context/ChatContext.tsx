import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { ChatMessage, Session, AppSettings, Attachment } from '../types';
import { postMessage } from '../vscode-api';

interface ChatState {
  messages: ChatMessage[];
  sessions: Session[];
  currentSessionId: string | null;
  isStreaming: boolean;
  streamingContent: string;
  settings: AppSettings | null;
}

type ChatAction =
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'SET_MESSAGES'; messages: ChatMessage[] }
  | { type: 'SET_SESSIONS'; sessions: Session[] }
  | { type: 'SET_STREAMING'; isStreaming: boolean }
  | { type: 'APPEND_STREAM_CHUNK'; content: string }
  | { type: 'STREAM_DONE' }
  | { type: 'SET_SETTINGS'; settings: AppSettings }
  | { type: 'SET_CURRENT_SESSION'; sessionId: string | null };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };
    case 'SET_MESSAGES':
      return { ...state, messages: action.messages };
    case 'SET_SESSIONS':
      return { ...state, sessions: action.sessions };
    case 'SET_STREAMING':
      return { ...state, isStreaming: action.isStreaming };
    case 'APPEND_STREAM_CHUNK':
      return {
        ...state,
        streamingContent: state.streamingContent + action.content,
        isStreaming: true,
      };
    case 'STREAM_DONE':
      return {
        ...state,
        isStreaming: false,
        streamingContent: '',
      };
    case 'SET_SETTINGS':
      return { ...state, settings: action.settings };
    case 'SET_CURRENT_SESSION':
      return { ...state, currentSessionId: action.sessionId };
    default:
      return state;
  }
}

const initialState: ChatState = {
  messages: [],
  sessions: [],
  currentSessionId: null,
  isStreaming: false,
  streamingContent: '',
  settings: null,
};

interface ChatContextValue {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
  sendMessage: (text: string, attachments?: Attachment[]) => void;
  cancelStream: () => void;
  regenerate: () => void;
  newChat: () => void;
  loadSession: (sessionId: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const settingsRef = useRef(state.settings);
  settingsRef.current = state.settings;

  const sendMessage = useCallback((text: string, attachments?: Attachment[]) => {
    dispatch({
      type: 'ADD_MESSAGE',
      message: {
        id: `user_${Date.now()}`,
        role: 'user',
        content: text,
        attachments,
        createdAt: new Date().toISOString(),
      },
    });
    const systemPrompt = settingsRef.current?.systemPrompt;
    postMessage({ type: 'send-message', text, attachments, systemPrompt });
  }, []);

  const cancelStream = useCallback(() => {
    postMessage({ type: 'cancel-stream' });
  }, []);

  const regenerate = useCallback(() => {
    postMessage({ type: 'regenerate' });
  }, []);

  const newChat = useCallback(() => {
    dispatch({ type: 'SET_MESSAGES', messages: [] });
    postMessage({ type: 'new-chat' });
  }, []);

  const loadSession = useCallback((sessionId: string) => {
    dispatch({ type: 'SET_CURRENT_SESSION', sessionId });
    postMessage({ type: 'load-session', sessionId });
  }, []);

  return (
    <ChatContext.Provider value={{ state, dispatch, sendMessage, cancelStream, regenerate, newChat, loadSession }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
