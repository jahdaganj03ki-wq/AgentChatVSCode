export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Attachment[];
  createdAt: string;
  tokens?: number;
}

export interface Attachment {
  type: 'image' | 'file';
  name: string;
  mimeType: string;
  data: string;
  size: number;
}

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  providerId: string;
  modelId: string;
  systemPrompt?: string;
  messages: ChatMessage[];
  tokenCount: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  enabled: boolean;
}

export interface ExtensionMessage {
  type: 'stream-chunk' | 'stream-done' | 'stream-error' | 'model-list' | 'session-list' | 'settings' | 'messages-load' | 'test-result' | 'send-text' | 'attachments-picked';
  content?: string;
  error?: string;
  sessions?: Session[];
  settings?: AppSettings;
  messages?: ChatMessage[];
  result?: TestResult;
  text?: string;
  attachments?: Attachment[];
}

export interface AppSettings {
  providers: ProviderConfig[];
  defaultProvider: string;
  systemPrompt: string;
}

export interface TestResult {
  success: boolean;
  latencyMs?: number;
  error?: string;
}

export type WebviewMessage =
  | { type: 'send-message'; text: string; attachments?: Attachment[]; providerId?: string; systemPrompt?: string }
  | { type: 'cancel-stream' }
  | { type: 'regenerate' }
  | { type: 'new-chat' }
  | { type: 'load-session'; sessionId: string }
  | { type: 'pick-attachment' }
  | { type: 'save-settings'; providerId: string; apiKey?: string }
  | { type: 'test-connection'; providerId: string };
