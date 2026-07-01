# Fix Activity Bar Icon & Empty Chat View

## Root Causes

### 1. Chat view empty — CSP nonce mismatch (Critical)
`getNonce()` is called **twice** per panel — once for the CSP header, once for the `<script>` tag. Each call produces a different random nonce, so the browser blocks the script. Without React mounting, the webview is blank.

Affected files:
- `src/views/webview/chat-panel.ts:48,110`
- `src/views/webview/settings-panel.ts:34,84`

### 2. Chat view empty — missing CSS `<link>`
esbuild extracts CSS to separate files (`dist/webview/index.css`, `dist/webview/settings.css`), but neither HTML template includes a `<link>` tag. The webview renders unstyled.

### 3. Activity bar icon doesn't open the chat
`package.json` registers only a **tree view** (`apexagent-sessions`) under the `apexagent` view container. The actual chat is created as a floating `WebviewPanel` via the `apexagent.openChat` command. Clicking the activity bar icon shows an empty Sessions sidebar.

### 4. Provider `<select>` missing `onChange`
`ChatView.tsx:20` renders a provider dropdown with no `onChange` handler — users cannot switch providers from the UI.

### 5. Settings panel also broken
`settings-panel.ts` has the same nonce bug and missing CSS link.

---

## Implementation Steps

### Step 1 — Fix CSP nonce (both panels)

**Files**: `src/views/webview/chat-panel.ts`, `src/views/webview/settings-panel.ts`

- Store the nonce in a local variable before constructing the CSP string.
- Pass the same nonce into `getHtml(csp, nonce)` instead of calling `getNonce()` inside the template.

### Step 2 — Add CSS links to both HTML templates

**Files**: `src/views/webview/chat-panel.ts`, `src/views/webview/settings-panel.ts`

- Build the webview URI for `dist/webview/index.css` (chat) and `dist/webview/settings.css` (settings).
- Insert `<link rel="stylesheet" href="...">` in `<head>` before the meta tags.
- CSP already includes `cspSource` in `style-src`, so external stylesheets from `dist/` are allowed.

### Step 3 — Convert chat to WebviewView (sidebar)

**New file**: `src/views/webwebview/chat-view-provider.ts`

- Class `ChatViewProvider` implementing `vscode.WebviewViewProvider`.
- `resolveWebviewView()` replaces the current `ChatPanel.show()` logic:
  - Generate single nonce, build CSP, build HTML (with nonce and CSS link).
  - Set up `onDidReceiveMessage` handler (same message types as current `handleMessage`).
  - Create a session, post settings and session-list messages.
- Keep same `WebviewMessage` / `ExtensionMessage` types.
- Import `ProviderManager`, `ChatManager`, `SessionManager` as before.
- Export `ChatViewProvider` class.

**File**: `package.json`

Replace:
```json
"views": {
  "apexagent": [
    {
      "type": "tree",
      "id": "apexagent-sessions",
      "name": "Sessions"
    }
  ]
}
```
With:
```json
"views": {
  "apexagent": [
    {
      "type": "webview",
      "id": "apexagent.chatView",
      "name": "Chat"
    }
  ]
}
```

Remove the `apexagent-sessions` tree data provider registration.

**File**: `src/extension.ts`

Remove:
- `SessionTreeProvider` import and instantiation
- `window.registerTreeDataProvider('apexagent-sessions', ...)`

Add:
- `ChatViewProvider` import
- `window.registerWebviewViewProvider('apexagent.chatView', chatViewProvider, { webviewOptions: { retainContextWhenHidden: true } })`

Update commands:
- `apexagent.openChat` → `vscode.commands.executeCommand('apexagent.chatView.focus')`
- `apexagent.newChat` → focus + call `chatViewProvider.newChat()`
- `apexagent.askSelection` → focus + call `chatViewProvider.sendUserMessage(selection)`
- `apexagent.regenerate` → `chatViewProvider?.regenerate()`
- `apexagent.cancel` → `chatViewProvider?.cancelStream()`
- `apexagent.openSettings` → `chatViewProvider?.openSettings()` (keep SettingsPanel as-is)

Delete `ChatPanel` class from `src/views/webview/chat-panel.ts`.

**File**: `src/views/session-tree.ts`

Delete entire file.

### Step 4 — Add provider onChange

**File**: `src/views/webview/app/components/ChatView.tsx`

- Add a `handleProviderChange` callback.
- On the `<select>`, add `onChange={(e) => postMessage({ type: 'set-provider', providerId: e.target.value })}`.
- In `chat-view-provider.ts` (or current chat-panel.ts handler), add a `set-provider` case that updates the default provider.

### Step 5 — Update `.vscodeignore`

Remove `media/apexagent-icon.svg` from the ignore list so it's included in packaging (or delete it if unused — only `media/apexagent.svg` is referenced).

---

## Files Changed (Summary)

| File | Action |
|---|---|
| `src/views/webwebview/chat-view-provider.ts` | **Create** — WebviewViewProvider |
| `src/views/webview/chat-panel.ts` | **Delete** |
| `src/views/session-tree.ts` | **Delete** |
| `src/views/webview/settings-panel.ts` | **Edit** — fix nonce, add CSS link |
| `src/extension.ts` | **Edit** — register WebviewViewProvider, update commands |
| `package.json` | **Edit** — replace tree view with webview view |
| `src/views/webview/app/components/ChatView.tsx` | **Edit** — add onChange to provider select |
| `.vscodeignore` | **Edit** — remove media/apexagent-icon.svg exclusion |

---

## Validation

1. `npm run build` succeeds.
2. Launch via F5 — activity bar shows ApexAgent icon.
3. Click icon → chat opens in sidebar with header, message area, input area, footer.
4. Send a message → streaming works, response appears.
5. Ctrl+Shift+I opens chat (sidebar focus).
6. Provider dropdown lets you switch providers.
7. Settings panel opens correctly via command.
8. `npm run lint` passes with no errors.
