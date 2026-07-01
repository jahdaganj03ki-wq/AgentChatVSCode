# Plan: Attachments Wiring + Agent Capabilities Expansion

## Overview

Six workstreams, ordered by dependency:

1. **Phase 1** — Wire attachment button to VS Code file dialog (concrete, well-scoped)
2. **Phase 2** — Tool calling / subagent system (LLM can invoke tools)
3. **Phase 2.5** — Token counting & context window management
4. **Phase 2.6** — MCP (Model Context Protocol) server support
5. **Phase 3** — Plan Mode & Code Mode
6. **Phase 4** — Full settings parity with Kilo Code & Cline
7. **Phase 5** — Deep VS Code integration (file tree, diagnostics, terminal, git)

---

## Phase 1: Attachment Wiring

### Goal
The 📎 button in `InputArea.tsx` opens VS Code's native file dialog. Selected files become visible attachments in the input area and are sent to the LLM with the message. Images are sent as `image_url` parts (vision models); text/code files are inlined as context.

### Type Changes

#### `src/providers/base-provider.ts`
- Add `ContentPart` union type:
  ```ts
  export type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };
  ```
- Change `ChatMessage.content` from `string` to `string | ContentPart[]`

#### `src/views/webview/app/types.ts`
- Add to `WebviewMessage`:
  ```ts
  | { type: 'pick-attachment' }
  | { type: 'send-message'; text: string; attachments?: Attachment[]; providerId?: string; systemPrompt?: string }
  ```
- Add to `ExtensionMessage`:
  ```ts
  | { type: 'attachments-picked'; attachments: Attachment[] }
  ```

#### `src/chat/chat-manager.ts`
- `sendMessage` accepts optional `attachments: Attachment[]` param
- When constructing provider messages, if attachments exist:
  - For each `image` attachment → `ContentPart` with `image_url` (data URI)
  - For `file` attachments → inline as text context in the user message (prepend `--- File: name.ext ---\n<content>\n---`)
- Update `sendMessage` signature to include attachments
- Pass attachments through to `sessionManager.addMessage()`

### Extension Host Side

#### `src/views/webview/app/components/InputArea.tsx` — Drag-and-drop
- Add `onDragOver` (preventDefault to allow drop) and `onDrop` handlers
- On drop, extract `DataTransferItem` from dropped files
- Send each file via a new message type to extension host, or directly if they're text/images
- For files dropped from VS Code explorer: `DataTransferItem` has `kind: 'file'` and the webview can access `item.getAsFile()`
- Reuse the same attachment flow (postMessage → extension reads file → returns attachments)
- Visual feedback: highlight input area border when dragging over

#### Extension Host — `src/views/webview/chat-panel.ts`
- Handle `pick-attachment` message:
  ```ts
  case 'pick-attachment': {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      canSelectFiles: true,
      canSelectFolders: false,
      openLabel: 'Attach',
    });
    if (!uris) break;
    const attachments: Attachment[] = [];
    for (const uri of uris) {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > 10 * 1024 * 1024) continue; // 10MB limit
      const data = await vscode.workspace.fs.readFile(uri);
      const mime = getMimeType(uri);
      attachments.push({
        type: mime.startsWith('image/') ? 'image' : 'file',
        name: uri.path.split('/').pop() || '',
        mimeType: mime,
        data: Buffer.from(data).toString('base64'),
        size: stat.size,
      });
    }
    this.postMessage({ type: 'attachments-picked', attachments });
    break;
  }
  ```
- Handle `send-message` with attachments: pass to `chatManager.sendMessage(text, callbacks, attachments)`

#### `src/views/webview/chat-panel.ts` — CSP update
- Already has `img-src data: https:` — data URIs are allowed for image previews

#### Vision model validation
- Add a `visionModels` map or check in `ProviderConfig`: `vision?: boolean`
- Hard-code known vision-capable models (gpt-4o, gpt-4o-mini, claude-3-5-sonnet, claude-3-opus, gemini-pro-vision, etc.)
- In `openai-compatible.ts`: if provider returns model metadata with capabilities, use that
- If user attaches images to a non-vision model, show warning in webview before sending:
  - `"Model XYZ may not support image inputs. Vision models require specific model support."`
- User can still send (the API will error gracefully)

### Webview Side

#### `src/views/webview/app/components/InputArea.tsx`
- Add `attachments` state (`Attachment[]`)
- Wire attach button:
  ```tsx
  onClick={() => postMessage({ type: 'pick-attachment' })}
  ```
- Listen for `attachments-picked` extension message → set `attachments`
- Render attachment pills below textarea:
  - Image: small thumbnail
  - File: filename + size
  - Each has an × remove button
- Modify `handleSubmit` to include attachments in `sendMessage()` call
- Reset attachments after send

#### `src/views/webview/app/context/ChatContext.tsx`
- Update `sendMessage(text, attachments?)`:
  ```ts
  postMessage({ type: 'send-message', text, attachments, systemPrompt });
  ```
- Add the user message to local state with attachments for immediate display

#### `src/views/webview/app/components/MessageBubble.tsx`
- If `message.attachments` exist, render:
  - Image attachments: `<img>` with `data:...` src
  - File attachments: show name + download link

#### `src/views/webview/app/components/App.tsx`
- Handle `attachments-picked` message in the `window.addEventListener('message', handler)`:
  - This is a listener in App.tsx but it dispatches to ChatContext
  - Actually, InputArea can listen directly via its own `useEffect` + `window.addEventListener`

Better approach: InputArea manages attachments locally with a `useEffect` to listen for `attachments-picked` messages.

#### `src/views/webview/app/styles/global.css`
- Add styles:
  ```css
  .attachment-preview { display: flex; gap: 8px; flex-wrap: wrap; padding: 4px 0; }
  .attachment-item { ... } /* pill style */
  .attachment-img { width: 60px; height: 60px; object-fit: cover; border-radius: 4px; }
  .attachment-remove { ... }
  ```

### Provider Side

#### `src/providers/openai-compatible.ts`
- Update `buildBody(messages, options)`:
  ```ts
  protected buildBody(messages: ChatMessage[], options?: {...}): Record<string, unknown> {
    return {
      model: this.config.model || 'gpt-3.5-turbo',
      messages: messages.map(msg => ({
        role: msg.role,
        content: Array.isArray(msg.content)
          ? msg.content
          : msg.content,
      })),
      stream: true,
      max_tokens: options?.maxTokens ?? this.config.maxTokens ?? 4096,
      temperature: options?.temperature ?? this.config.temperature ?? 0.7,
    };
  }
  ```
  The OpenAI API already accepts `content` as either a string or an array of parts.

### Storage

#### `src/chat/session-manager.ts`
- Already has `addMessage(role, content, attachments?)` — verify it works with the new flow
- The `ChatMessage` content in storage stays as original message text string
- Attachments are stored separately in the `attachments` field

### Tests

#### `src/__tests__/openai-compatible.test.ts`
- Add test for `buildBody` with `ContentPart[]` content
- Add test for mixed content (text + image_url)

#### New test: `src/__tests__/chat-manager.test.ts`
- Test that attachments are properly passed from `sendMessage` to provider

### Message Flow (end-to-end)

```
User clicks 📎
  → InputArea sends { type: 'pick-attachment' }
  → ChatPanel opens VS Code file dialog
  → Files read, encoded as base64
  → ChatPanel sends { type: 'attachments-picked', attachments }
  → InputArea displays attachment pills
User types text + clicks send
  → InputArea sends { type: 'send-message', text, attachments }
  → ChatPanel: chatManager.sendMessage(text, callbacks, attachments)
  → ChatManager stores message with attachments via SessionManager
  → ChatManager builds ChatMessage[] with ContentPart[] for provider
  → OpenAICompatibleProvider.stream() sends multi-part content
  → Response streamed back normally
```

---

## Phase 2: Tool Calling / Subagent System

### Architecture

```
LLM Response
  → Parse tool_calls from response chunk
  → For each tool_call:
    - Look up tool handler
    - Execute tool (read file, write file, terminal, etc.)
    - Return result as tool_role message
  → Continue streaming with tool results in context
```

### Tool Definitions

File: `src/tools/types.ts`
```ts
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}
```

### Complete Tool Catalog

| Tool | Description | Parameters | Permission | Category |
|------|-------------|------------|------------|----------|
| `read_file` | Read file contents | `{ path: string }` | auto-approve | Read |
| `read_multiple_files` | Read multiple files at once | `{ paths: string[] }` | auto-approve | Read |
| `write_file` | Create or overwrite a file | `{ path: string, content: string }` | ask | Write |
| `edit_file` | Apply search/replace edit (diff-style) | `{ path: string, oldString: string, newString: string }` | ask | Write |
| `rename_file` | Rename or move a file | `{ path: string, newPath: string }` | ask | Write |
| `delete_file` | Delete a file | `{ path: string }` | ask | Write |
| `list_files` | List directory contents | `{ path: string, pattern?: string }` | auto-approve | Read |
| `search_files` | Grep for pattern across files | `{ pattern: string, path?: string, include?: string }` | auto-approve | Read |
| `run_terminal` | Execute a terminal command | `{ command: string, cwd?: string, timeout?: number }` | ask | Terminal |
| `run_in_background` | Start a long-running process | `{ command: string, cwd?: string }` | ask | Terminal |
| `ask_question` | Ask user for clarification | `{ question: string, options?: string[] }` | n/a | User |
| `get_diagnostics` | Get VS Code diagnostics for a file or all | `{ path?: string }` | auto-approve | Read |
| `git_status` | Show working tree status | `{ path?: string }` | auto-approve | Git |
| `git_diff` | Show unstaged/staged diff | `{ path?: string, staged?: boolean }` | auto-approve | Git |
| `git_log` | Show recent commit history | `{ count?: number, path?: string }` | auto-approve | Git |
| `git_stage` | Stage file(s) for commit | `{ files: string[] }` | ask | Git |
| `git_unstage` | Unstage file(s) | `{ files: string[] }` | ask | Git |
| `git_commit` | Create a commit | `{ message: string }` | ask | Git |
| `git_create_branch` | Create and switch to a new branch | `{ name: string, base?: string }` | ask | Git |
| `search_web` | Search the web for information | `{ query: string }` | auto-approve | Web |
| `fetch_url` | Fetch URL content | `{ url: string }` | auto-approve | Web |
| `mcp_call` | Call an MCP server tool | `{ serverName: string, toolName: string, arguments: object }` | ask | MCP |
| `mcp_list_tools` | List available MCP server tools | `{ serverName?: string }` | auto-approve | MCP |

#### `src/providers/provider-manager.ts`
- Register new `AnthropicProvider` in `initializeDefaults()`
- Import and add: `this.register(new AnthropicProvider());`

### Provider Formats — Both OpenAI + Anthropic

#### `src/providers/openai-compatible.ts` (OpenAI format)
- Add `buildTools(tools: ToolDefinition[]): Record<string, unknown>`:
  ```ts
  return tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }));
  ```
- Add `parseToolCalls(responseChoice: any): ToolCall[]` → extracts `delta.tool_calls` from SSE
- Update `chat()` to:
  1. If tools are registered, add `tools` to request body
  2. Handle `delta.tool_calls` in SSE parsing (accumulate index-based calls)
  3. After stream ends, yield any completed `tool_calls` as a special chunk
- OpenAI content format stays as `content: string | ContentPart[]`

#### New file: `src/providers/anthropic-compatible.ts` (Anthropic format)
- Registered in `ProviderManager` as new provider `anthropic` with baseUrl `https://api.anthropic.com/v1`
- Default model: `claude-sonnet-4-20250514`
- Extends `BaseProvider`, separate from `OpenAICompatibleProvider`
- Does NOT extend `OpenAICompatibleProvider` — Anthropic API is structurally different

**Content block format** (Anthropic always uses array of blocks):
```typescript
// Text
{ type: 'text', text: 'Hello' }

// Image (from attachment)
{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: '<base64>' } }

// Tool use (from LLM)
{ type: 'tool_use', id: 'toolu_123', name: 'read_file', input: { path: '/x' } }

// Tool result (from tool execution)
{ type: 'tool_result', tool_use_id: 'toolu_123', content: 'file content' }
```

**`buildHeaders()`:**
```ts
protected buildHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': this.config.apiKey || '',
    'anthropic-version': '2023-06-01',
  };
}
```

**`buildBody()`:**
- Convert `ChatMessage[]` to Anthropic format
- `ContentPart[]` with `image_url` → `{ type: 'image', source: { type: 'base64', media_type, data } }`
  - Parse `data:image/png;base64,...` URL to extract media_type and data
- Tool role messages (OpenAI `role: 'tool'`) → `role: 'user'` with `tool_result` blocks
- Assistant messages with `tool_calls` → `role: 'assistant'` with `tool_use` blocks in content array
- System message → passed as `system` parameter (separate from messages array)
- Parameters: `model`, `max_tokens`, `temperature`, `stream: true`, `tools` (optional)

**`chat()` — SSE streaming from `POST /v1/messages`:**
- Anthropic SSE events: `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`, `ping`
- Parse `content_block_delta` for text deltas (`delta.text`)
- Handle `content_block_start` with `type: 'tool_use'` → extract tool call (id, name, input)
- Handle `content_block_delta` with `delta.type: 'input_json_delta'` → accumulate tool call arguments (partial JSON)
- After `content_block_stop` for tool_use → yield completed tool call
- Handle `message_delta` for `stop_reason: 'tool_use'` or `stop_reason: 'end_turn'`
- Error handling: `error` event or non-200 status → parse error type (same error taxonomy)
- Map Anthropic errors: `invalid_request_error` → `AUTH_FAILED`, `rate_limit_error` → `RATE_LIMITED`, `overloaded_error` → `MODEL_UNAVAILABLE`

**Vision support:**
- Anthropic supports images in `user` messages via `image` blocks
- Supported media types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Max image size: 5MB per image (smaller than OpenAI's 10MB per-image limit) — enforce this limit

### Tool-Agnostic Message Format

Define a provider-agnostic intermediate format in `src/chat/types.ts`:

```ts
export interface ToolCallRequest {
  id: string;
  type: 'function'; // or 'tool_use' for Anthropic
  function: { name: string; arguments: string }; // JSON string
}

export interface ToolCallResultMessage {
  role: 'tool' | 'user'; // 'tool' for OpenAI, 'user' for Anthropic
  tool_call_id?: string;
  content: string;
}
```

Each provider translates to/from this format internally.

### Chat Manager Changes (`src/chat/chat-manager.ts`)

- Maintain tool registry `Map<string, ToolHandler>`
- After streaming completes, check if response has tool_calls
- For each tool call:
  1. Execute tool handler
  2. Add assistant message with tool_calls
  3. Add tool result message
  4. Re-call provider with updated messages
- Support max tool call depth (e.g. 25 rounds)

### Webview Changes

- Display tool calls in UI (expandable)
- Show tool results inline
- New `ToolCallDisplay.tsx` component

### Tool Handlers

File: `src/tools/handlers/`
- `read-file.ts`
- `write-file.ts`  
- `edit-file.ts`
- `list-files.ts`
- `search-files.ts`
- `run-terminal.ts`
- `ask-question.ts`

### Settings for Tools

- `apexagent.tools.allowReadOnly` (boolean, default: true) — auto-approve read tools
- `apexagent.tools.allowWriteFile` (boolean, default: false) — require approval
- `apexagent.tools.allowTerminal` (boolean, default: false) — require approval
- `apexagent.tools.alwaysAllow` (string[]) — paths always allowed
- `apexagent.tools.maxToolCalls` (number, default: 25) — max tool call rounds

---

## Phase 2.5: Token Counting & Context Window Management

### Goal
Track token usage per message/session, manage context window limits, auto-trim when approaching limits, and display token counts in the UI.

### Implementation

#### Token Counter: `src/chat/token-counter.ts`
- Use `tiktoken`-like token estimation for OpenAI models:
  ```ts
  import { getEncoding } from 'js-tiktoken';
  // OR use a simpler character-based estimation as fallback
  const enc = getEncoding('cl100k_base');
  countTokens(text: string): number {
    return enc.encode(text).length;
  }
  ```
- For Anthropic: use Anthropic's token counting API if available, else character-based (~4 chars/token)
- `countMessageTokens(msg: ChatMessage): number` — content + role overhead + attachment base64 overhead
- `countContextWindow(messages: ChatMessage[], systemPrompt?: string): { used: number, available: number }`
- Per-model context windows: store known context limits
  - gpt-4o: 128K, gpt-4o-mini: 128K, claude-sonnet-4: 200K, claude-3-haiku: 48K, etc.

#### Context Window Trimming: `src/chat/context-trimmer.ts`
- When approaching limit (e.g. >80% of context window), auto-trim oldest messages:
  1. Keep system prompt
  2. Keep last N messages needed for conversation coherence
  3. Summarize trimmed messages into a condensed prefix message
- Configurable: `contextTrimThreshold: 0.8`, `contextTrimStrategy: 'oldest' | 'summary'`

#### Provider-level integration
- `BaseProvider` gets optional method: `countTokens(messages, systemPrompt): number`
- `OpenAICompatibleProvider`: uses `cl100k_base` encoding
- `AnthropicCompatibleProvider`: uses Anthropic's `anthropic-token-counter` or heuristic

#### UI Display
- Show token count in footer: `"🔥 1,234 / 128,000 (1%)"`
- Color coding: green (<50%), yellow (50-80%), red (>80%)
- Show per-message tokens on hover in message metadata

#### Session Storage
- Store `tokenCount` in session (already exists)
- Update `tokenCount` after every message add
- When loading session, recalculate token count from messages

---

## Phase 2.6: MCP (Model Context Protocol) Server Support

### Goal
Allow users to add custom MCP servers (stdio or SSE) to extend the agent with custom tools and resources, matching Kilo Code/Cline capability.

### MCP Architecture

```
User configures MCP server in settings
  → Agent starts MCP client connection on activation
  → MCP client sends `list_tools` request
  → Tools are registered in the tool registry (same as built-in tools)
  → When LLM calls an MCP tool:
    1. ToolCall sent to MCP server via `call_tool`
    2. Result streamed back
    3. Returned to LLM as tool result
```

### Configuration Format (in `apexagent.json` or settings)

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      "env": {}
    },
    "github": {
      "type": "sse",
      "url": "http://localhost:3000/sse"
    }
  }
}
```

### Implementation

#### MCP Client: `src/tools/mcp/client.ts`
- Use `@modelcontextprotocol/sdk` for MCP protocol handling
- `McpClientManager` class:
  - `connect(serverName, config)` — spawn stdio process or connect SSE
  - `listTools(serverName)` → `ToolDefinition[]`
  - `callTool(serverName, toolName, args)` → `Promise<string>` (result content)
  - `disconnect(serverName)` — cleanup
  - `disconnectAll()` — on extension deactivate

#### Tool Registry Integration
- MCP tools are prefixed with `mcp_{serverName}_{toolName}` for unique IDs
- Registered alongside built-in tools
- Permission setting: block all MCP tools by default, require user approval per-call
- Setting: `apexagent.mcp.allowAll` (default: false) — global allow for MCP

#### Error Handling
- Stdio process crash → reconnect with backoff
- SSE connection loss → reconnect
- Tool call timeout → report error to LLM
- Invalid arguments → return error to LLM

#### Security
- MCP servers run with user's permissions
- Warning shown for MCP tools on first use per session
- User can always-allow specific MCP tools
- Stdio commands shown in settings so user can audit

---

## Phase 3: Plan Mode & Code Mode

### Goal
Like Kilo Code, the agent operates in two modes: **Plan Mode** (analyze, ask questions, produce a plan — read-only) and **Code Mode** (implement — full tool access). The user switches modes explicitly.

### Mode Behavior

| Aspect | Plan Mode | Code Mode |
|--------|-----------|-----------|
| System prompt | "You are a planning agent. Analyze the request, ask clarifying questions, and produce a detailed plan. Do NOT implement anything." | "You are a coding agent. Execute the plan." |
| Available tools | `read_file`, `list_files`, `search_files`, `ask_question`, `search_web` | ALL tools |
| File writes | Blocked | Allowed |
| Terminal | Blocked | Allowed |
| Git mutations | Blocked | Allowed |
| Typical output | Markdown plan | Code changes |

### Model Recommendation
- Plan Mode: cheaper/faster model (e.g., `gpt-4o-mini`, `claude-3-haiku`) — no need for strong coding
- Code Mode: full-power model (e.g., `gpt-4o`, `claude-sonnet-4`)

### UI

```
[ 💬 Chat ] [ ⚙️ Settings ]

Header:  [Plan Mode ▼]  [gpt-4o-mini ▼]
         ^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^
         Mode dropdown  Model selector (per-mode optional)
```

- Mode switch: dropdown in chat header, keyboard shortcut, or /plan /code command
- Visual indicator: Plan Mode = blue accent, Code Mode = green accent
- Footer shows current mode

### Implementation

#### `src/chat/types.ts`
```ts
export type AgentMode = 'plan' | 'code';

export interface ModeConfig {
  mode: AgentMode;
  systemPrompt?: string; // overrides default
  providerId?: string;   // separate model per mode
}
```

#### `src/chat/chat-manager.ts`
- `setMode(mode: AgentMode)` — switches system prompt and tool set
- `getAvailableTools(): ToolDefinition[]` — returns subset based on mode
- Mode stored in `ChatState` and synced to webview

#### Webview Changes
- Mode dropdown in `ChatView.tsx` header
- Send `{ type: 'set-mode', mode: 'plan' | 'code' }` to extension
- Extension updates `chatManager.mode` and re-sends system prompt
- CSS class on container for mode-specific styling

#### System Prompts
- Plan Mode prompt: instructs to ask clarifying questions, produce plans, NOT implement
- Code Mode prompt: instructs to implement, use tools, make changes
- Both include available tools list (dynamically generated based on mode)
- User custom instructions appended to both

#### Plan Output
- When user approves a plan, mode auto-switches to code (optionally)
- Plan rendered in chat as Markdown with an "Approve Plan & Implement" button

#### Settings: `package.json`
```json
"apexagent.mode.default": { "type": "string", "default": "plan", "enum": ["plan", "code"] },
"apexagent.mode.planModel": { "type": "string", "default": "" },
"apexagent.mode.codeModel": { "type": "string", "default": "" }
```

---

## Phase 4: Full Settings Parity

### Current vs Target Settings

| Setting | Current | Target |
|---------|---------|--------|
| Provider selection | ✓ | ✓ |
| System prompt | ✓ | ✓ |
| Log level | ✓ | ✓ |
| Session limit | ✓ | ✓ |
| Model selection | — | ✓ (per provider, fetched from API) |
| Temperature | — | ✓ (0.0–2.0 slider) |
| Max tokens | — | ✓ |
| Top P | — | ✓ |
| Custom instructions | — | ✓ (separate from system prompt) |
| Tool permissions | — | ✓ (see Phase 2) |
| Auto-approve | — | ✓ |
| Context limit | — | ✓ (max context tokens) |
| Default model per provider | — | ✓ |

### Implementation

1. **Settings UI**: Add Settings tab inside main chat webview while keeping the separate settings webview command
   - Add tab navigation to ChatView: "Chat" | "Settings"
   - Settings tab provides the same settings UI currently in `SettingsApp.tsx` but rendered as a React panel
   - The separate `apexagent.openSettings` command + webview is retained for users who prefer it (e.g. to compare side-by-side)
   - Both panels share the same message-passing handlers on the extension side

2. **`package.json` configuration**: Add new `configuration.properties`:
   ```json
   "apexagent.temperature": { "type": "number", "default": 0.7, "minimum": 0, "maximum": 2 },
   "apexagent.maxTokens": { "type": "number", "default": 4096 },
   "apexagent.topP": { "type": "number", "default": 1 },
   "apexagent.contextLimit": { "type": "number", "default": 128000 },
   "apexagent.customInstructions": { "type": "string", "default": "" },
   "apexagent.tools.allowReadOnly": { "type": "boolean", "default": true },
   "apexagent.tools.allowWriteFile": { "type": "boolean", "default": false },
   "apexagent.tools.allowTerminal": { "type": "boolean", "default": false },
   "apexagent.tools.maxToolCalls": { "type": "number", "default": 25 },
   ```

3. **SettingsPanel** → Settings Tab:
   - Convert `SettingsPanel` from separate webview to a React component rendered inside the chat
   - Add tab navigation in `ChatView.tsx`
   - Settings tab gets all provider configs, model lists, and general settings

4. **ProviderConfig**: Expand with `topP`, model list caching

---

## Phase 5: Deep VS Code Integration

### File Tree Access
- Tool: `list_files(path)`, `read_file(path)`, `get_workspace_info()`
- Uses `vscode.workspace.fs` APIs directly from extension host

### Diagnostics Integration
- Tool: `get_diagnostics(filePath?)` → reads from `vscode.languages.getDiagnostics()`
- Auto-include diagnostics of open files in context when relevant

### Terminal Integration
- Tool: `run_terminal(command, cwd?)` → creates/dispatches to VS Code terminal
- Capture output, handle long-running commands
- Use `vscode.window.createTerminal` + `Terminal.sendText`

### Git Integration
- Tool: `git_diff(filePath?)`, `git_status()`, `git_log(count?)`, `git_commit(message)`, `git_stage(paths)`
- Execute git commands via terminal or `simple-git` library
- View staged/unstaged changes

### Architecture

All integrations live in `src/tools/handlers/` directory:
```
src/tools/
  handlers/
    read-file.ts
    write-file.ts
    edit-file.ts
    list-files.ts
    search-files.ts
    run-terminal.ts
    ask-question.ts
    get-diagnostics.ts
    git-status.ts
    git-diff.ts
    git-log.ts
    git-stage.ts
    git-commit.ts
  types.ts
  registry.ts
  approval.ts       // approval UI logic
```

### Approval UI (Inline Chat Messages)

When a tool requires approval:
1. Webview shows an approval message bubble in the chat stream
2. Options: **Approve** | **Approve Always** (for this tool) | **Deny**
3. Extension host blocks execution until user responds
4. Message passing: `{ type: 'tool-approval-request', toolCall, toolDefinition }` → `{ type: 'tool-approval-response', approved: boolean, alwaysAllow?: boolean }`
5. New component: `ToolApproval.tsx` — renders as a styled message bubble with action buttons
   - Shows tool name + arguments (formatted)
   - "Approve" button (primary), "Always Allow" (secondary), "Deny" (danger)
   - If "Always Allow", persist choice to settings so same tool auto-approves next time

### `ask_question` UX Pattern

The `ask_question` tool enables the LLM to ask the user for input mid-conversation:

1. LLM calls `ask_question({ question: 'What port should I use?', options?: ['3000', '4000', '5000'] })`
2. Extension host receives the tool call → does NOT execute immediately
3. Webview renders a styled question bubble with:
   - The question text
   - If `options` provided: clickable buttons for each option
   - If no options: a text input field + submit button
4. User responds via the chat UI
5. Webview sends `{ type: 'user-response', text: '3000' }` to extension
6. Extension returns the response as tool result to the LLM
7. LLM continues with the user's answer in context

**Implementation:**
- New webview component: `UserQuestion.tsx` — renders inline in the message list
- `ToolCall` with `name: 'ask_question'` is intercepted by `chat-manager.ts` before tool execution
- `ChatManager` pauses the tool loop, sends question to webview, waits for response
- Timeout: if user doesn't respond in 5 minutes, tool returns timeout error
- Keyboard shortcut: Enter to submit in text mode, number keys for option buttons

### Checkpoints & Diff System (File Change Tracking)

Like Kilo Code, every file write/edit creates a checkpoint for revert:

**Architecture:**
```
Before file write: create backup in extension storage
  → `src/checkpoints/checkpoint-manager.ts`
  → Store original file content at `.apexagent/checkpoints/<session-id>/<file-hash>`
  → Create diff between original and new content
  → Register checkpoint in session metadata
After write: user can view diff and revert
```

**CheckpointManager: `src/checkpoints/checkpoint-manager.ts`**
```ts
class CheckpointManager {
  createCheckpoint(sessionId: string, filePath: string, originalContent: string): string
  getCheckpoint(id: string): { filePath, originalContent, newContent, timestamp }
  getSessionCheckpoints(sessionId: string): Checkpoint[]
  revertToCheckpoint(id: string): Promise<void>
  discardCheckpoint(id: string): void
}
```

**Integration with write_file/edit_file tools:**
1. Before executing the tool, handler calls `checkpointManager.createCheckpoint()`
2. Original content is read via `vscode.workspace.fs.readFile()`
3. Checkpoint metadata stored in session JSON (lightweight — just paths + timestamps)
4. Full original content stored in extension's global storage (not in session JSON)

**UI:**
- In message bubble after a file edit: "📝 View Changes" button
- Click opens a diff view (inline in chat or new editor tab)
- Uses VS Code's built-in diff editor: `vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title)`
- Revert button in the diff view or chat bubble
- Session sidebar shows "N file changes" per session

**Settings:**
```json
"apexagent.checkpoints.enabled": { "type": "boolean", "default": true },
"apexagent.checkpoints.maxPerSession": { "type": "number", "default": 100 },
"apexagent.checkpoints.storageDays": { "type": "number", "default": 7 }
```

### Browser Automation

Add a `browser_action` tool for headless web browsing (like Cline):

**Tool definition:**
| Tool | Description | Parameters | Permission |
|------|-------------|------------|------------|
| `browser_action` | Perform browser action (navigate, click, type, screenshot) | `{ action: 'navigate' \| 'click' \| 'type' \| 'screenshot' \| 'evaluate', url?: string, selector?: string, text?: string, script?: string }` | auto-approve |

**Implementation: `src/tools/handlers/browser-action.ts`**
- Use `playwright` (headless Chromium) as the browser engine
- Lazy-initialize: browser context created on first call, reused for session
- Each session gets an isolated browser context (cookies, localStorage)
- Actions:
  - `navigate`: Go to URL, wait for page load
  - `click`: Click element by CSS selector
  - `type`: Type text into input field
  - `screenshot`: Capture full-page screenshot (returned as data URI — displayed in chat)
  - `evaluate`: Execute JavaScript in page context
- Screenshots displayed inline in the chat message bubble
- Timeout per action: 15s default
- Browser process lifecycle: start on first use, close on session end or after 5min idle

**Dependencies:**
- `npm install playwright` (or use bundled Chromium from VS Code)
- Note: playwright adds ~200-300MB to node_modules. Consider using VS Code's Electron Chromium instead.

### Prompt Caching

Optimize token usage and latency by caching repeated prompt prefixes:

**Strategy (OpenAI):**
- OpenAI supports `prompt_tokens` in usage stats — track these
- Implement prompt caching for messages before the latest user message:
  - Cache key: hash of (provider, model, systemPrompt, messages[0..n-1], tools)
  - Cache value: number of input tokens + cached tokens
- When re-sending messages (tool call loop), reuse the cached prefix
- Track `cache_creation_input_tokens` and `cache_read_input_tokens` from API response

**Strategy (Anthropic):**
- Anthropic supports prompt caching natively via `cache_control` breakpoints
- Insert `"cache_control": {"type": "ephemeral"}` in:
  - System prompt
  - Tools definition block
  - Every Nth message (e.g., every 10th message)
- Track `cache_creation_input_tokens` and `cache_read_input_tokens` from API response

**Implementation:**
- `src/chat/prompt-cache.ts` — manages cache headers and token tracking
- `getCacheHeaders(messages, systemPrompt, tools): Record<string, string>` — returns appropriate cache control headers based on provider
- Token usage displayed in UI: total vs cached
- Setting: `apexagent.cache.promptCaching` (boolean, default: true) — enable/disable

**UI:**
- Token count display: `"🔥 1,234 + 456 cached / 128,000 (1%)"`
- Cache hit rate shown in session stats

### Error Recovery Patterns

Robust error handling across all phases:

**Provider Errors:**
| Error | Recovery |
|-------|----------|
| `AUTH_FAILED` (401/403) | Show error in chat; prompt user to check API key settings |
| `RATE_LIMITED` (429) | Exponential backoff: 1s → 2s → 4s, max 3 retries (already implemented in `retry.ts`) |
| `MODEL_UNAVAILABLE` (503) | Retry once after 5s; if still failing, suggest model fallback list |
| `QUOTA_EXCEEDED` (402/429) | Show error; suggest switching to a cheaper model |
| `TIMEOUT` | Retry once; if still failing, suggest user split the request |
| `NETWORK` (fetch failed) | Retry with backoff 1s → 2s → 4s; if offline, show offline indicator |
| `STREAM_ERROR` (parse error) | Log raw response; abort stream; show partial content if any |

**Tool Execution Errors:**
| Error | Recovery |
|-------|----------|
| File not found | Return error to LLM; LLM can try alternative path |
| Permission denied | Show approval dialog if not already approved; if denied, return to LLM |
| Command timeout | Kill process; return partial output + timeout error to LLM |
| Invalid arguments | Return validation error to LLM with schema info |
| MCP server disconnected | Attempt reconnect (max 3); return error to LLM if fails |

**Global Error Handler (`src/chat/error-recovery.ts`):**
```ts
interface RecoveryStrategy {
  retryable: boolean;
  maxRetries: number;
  backoffMs: number[];
  fallbackAction?: () => Promise<void>;
  userMessage?: string; // shown to user
}
```

**UI Integration:**
- Errors shown as styled message bubbles (red/orange based on severity)
- "Retry" button on error bubbles restarts the last operation
- "Fallback" button on model errors switches to next available model
- Offline indicator: yellow bar at top of chat when `navigator.onLine === false`

**Session State Recovery:**
- If extension crashes/restarts during streaming:
  1. On re-activation, check for incomplete sessions (no final assistant message)
  2. Show "Session recovered from restart" message
  3. Allow user to retry or discard partial response
- Store streaming state in `context.workspaceState` (survives webview refresh but not extension restart)

---

## Implementation Order

1. **Phase 1 (Attachments)** — independent, concrete, highest priority
2. **Phase 2 (Tool calling)** — requires Phase 1 provider changes as foundation for multi-part content + tool types
3. **Phase 2.5 (Token counting)** — can proceed in parallel with Phase 2; independent module
4. **Phase 2.6 (MCP)** — depends on Phase 2 tool registry infrastructure
5. **Phase 3 (Plan/Code Mode)** — depends on Phase 2 tool permissions infrastructure
6. **Phase 4 (Settings)** — largely independent, can start after Phase 1
7. **Phase 5 (Deep integration)** — depends on Phase 2 tool infrastructure; git/terminal/diagnostics tools added to catalog

### Sub-phases within Phases
- **Checkpoint system**: within Phase 2 Tool Handlers (implement alongside `write_file`/`edit_file`)
- **Browser automation**: within Phase 2 Tool Catalog (add `browser_action` tool handler)
- **`ask_question` UX**: within Phase 2 Webview Changes (new `UserQuestion` component)
- **Prompt caching**: within Phase 2.5 Token Counting (shared optimization module)
- **Error recovery**: spans all phases — implement `error-recovery.ts` in Phase 2, refine in later phases

Each phase should be implemented, tested, and verified before moving to the next.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Large attachments bloat session JSON | Enforce 10MB per-file limit; warn user |
| Vision models reject non-image content | Only send `image_url` parts for images; text files inlined as text |
| Tool calling infinite loops | `maxToolCalls: 25` hard cap |
| Binary files can't be read as text | Catch `fs.readFile` errors; show filename-only fallback |
| CSP blocks image data URIs | Already allows `img-src data:` |
| Provider doesn't support function calling | Check at runtime; fall back to text-only mode |
| Vision model metadata unreliable | Hard-code known vision models as primary source; allow user override in settings |
| Anthropic API format differs significantly from OpenAI | Separate `AnthropicCompatibleProvider` class; shared tool type definitions |
| Terminal commands may hang | Add timeout per command (default 30s) |
| MCP stdio process crashes | Auto-restart with backoff (3 retries, 2s/5s/10s) |
| Token counting with tiktoken adds ~2MB bundle size | Blob-treeshakable import; fallback to heuristic (4 chars/token) |
| Plan Mode outputs plan but user wants auto-implement | Never auto-switch; always require explicit user approval to switch to Code Mode |
| Context window trimming loses conversation history | Store original messages in session; trimming only affects sent messages, not stored |
| Playwright adds ~200MB to dependencies | Use VS Code bundled Chromium via `vscode.env.openExternal`; lazy-load playwright only on first browser call |
| Checkpoint storage grows large | Auto-prune checkpoints older than configured retention period; max N per session |
| Prompt caching adds complexity | Default to enabled; disable if user encounters consistency issues |
| Extension restart during streaming loses state | Persist partial response to `workspaceState` every N chunks for crash recovery |
| User doesn't respond to `ask_question` | Timeout after 5 minutes; return timeout error to LLM |
