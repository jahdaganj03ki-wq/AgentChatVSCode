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

export interface SkillInfo {
  name: string;
  description: string;
  tags: string[];
  state: 'discovered' | 'installed' | 'active' | 'error';
  source?: string;
  format?: string;
}

export interface ExtensionMessage {
  type: 'stream-chunk' | 'stream-done' | 'stream-error' | 'model-list' | 'session-list' | 'settings' | 'messages-load' | 'test-result' | 'send-text' | 'attachments-picked' | 'skill-list' | 'skill-installed' | 'skill-activated' | 'skill-install-progress' | 'skill-search-results';
  content?: string;
  error?: string;
  sessions?: Session[];
  settings?: AppSettings;
  messages?: ChatMessage[];
  result?: TestResult;
  text?: string;
  attachments?: Attachment[];
  skills?: SkillInfo[];
  skill?: SkillInfo;
  names?: string[];
  name?: string;
  status?: string;
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
  | { type: 'test-connection'; providerId: string }
  | { type: 'set-provider'; providerId: string }
  | { type: 'list-skills' }
  | { type: 'install-skill'; source: string; scope?: 'project' | 'global'; name: string }
  | { type: 'uninstall-skill'; name: string }
  | { type: 'activate-skill'; names: string[] }
  | { type: 'deactivate-skill'; names: string[] }
  | { type: 'search-skills'; query: string };
