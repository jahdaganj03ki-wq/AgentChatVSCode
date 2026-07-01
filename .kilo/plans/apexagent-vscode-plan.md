# ApexAgent – VS Code Extension Plan

## Übersicht
Neue VS Code Extension "ApexAgent" (`apexagent.apexagent-vscode`) – ein Multi-Provider Chat-Panel mit Fokus auf Free-Modelle. MIT Lizenz, von Grund auf neu entwickelt.

## Entscheidungen
| Aspekt | Entscheidung |
|--------|-------------|
| Ansatz | Neue Extension (kein Fork) |
| Sprache | TypeScript |
| Build | ESBuild (Extension + Webview getrennt) |
| UI | React 18 + Webview |
| VS Code Engine | ^1.95.0 |
| Lizenz | MIT |
| Publisher | `apexagent` |
| API-Keys | SecretStorage (optional: Settings.json) |
| Streaming | SSE, obligatorisch |

## 1. Provider-Architektur

### BaseProvider (abstract)
- `chat(messages, options): AsyncIterable<ChatChunk>` – Streaming
- `fetchModels(): Promise<ModelInfo[]>` – Auto-Erkennung
- `testConnection(): Promise<TestResult>` – Verbindungstest
- Provider-spezifische Header/Body via `buildHeaders()` / `buildBody()`

### Adapter-Hierarchie
```
BaseProvider
└── OpenAICompatibleProvider (generic)
    ├── OpenRouterProvider     – Headers: HTTP-Referer, X-Title
    ├── NVIDIAProvider         – NVIDIA NIM Free-Tier
    ├── OpenCodeZenProvider    – OpenAI-kompatibel
    └── PuterProvider          – OpenAI-kompatibel, Token aus Dashboard
```

### ProviderManager
- Registry (`Map<string, BaseProvider>`)
- Konfiguration via SecretStorage (API-Keys) + Settings (nicht-sensitive Felder)
- CRUD für Provider-Konfigurationen
- Default-Provider-Auswahl

### API-Details (OpenAI-kompatibel)
| Provider | Base URL | Auth |
|----------|----------|------|
| OpenRouter | `https://openrouter.ai/api/v1` | `Bearer <token>` |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `Bearer <token>` |
| OpenCode Zen | (zu bestätigen) | `Bearer <token>` |
| Puter.js | (zu bestätigen) | `Bearer <token>` |

Alle: `POST /chat/completions`, `GET /models`, SSE-Streaming.

### Webview-Kommunikation
- `ExtensionMessage`: `stream-chunk | stream-done | stream-error | model-list | session-list | settings`
- `WebviewMessage`: `send-message | cancel-stream | regenerate | new-chat | load-session | save-settings | test-connection`

## 2. Chat-UI (Webview)

### Layout
```
Header: [← Sessions] Model-Selector | Provider-Indicator | ⚙️
MessageList (scrollable, virtualisiert)
  ├── UserMessage: Avatar + Markdown + Attachments (Bilder/Dateien)
  ├── AssistantMessage: Avatar + Markdown + CodeBlocks + ActionBar (Copy/Regenerate/Delete)
  ├── StreamingMessage: Live-Update + █ Cursor + [Cancel]
  ├── ErrorMessage: ❌ + Retry-Button
  └── SystemMessage: System Prompt Info
InputArea: [📎] Textarea (auto-resize) [▶ Send]
Footer: Modell | Provider | Tokens
```

### Features
- Markdown-Rendering (marked) + Syntax-Highlighting (highlight.js)
- Code-Blöcke mit Copy-Button
- Image/File Attachments (File-Dialog via VS Code API)
- Streaming mit Blinking-Cursor
- Regenerate / Cancel / Edit / Copy / Delete pro Nachricht

### Styling
- VS Code Theme CSS-Variablen (`--vscode-*`) für Light/Dark
- Keine externen Stylesheets – nur CSS Modules im Bundle

## 3. Sessions & Tree View

### Sidebar: `apexagent-sessions`
- Automatische Gruppierung: Heute / Gestern / Älter
- Jede Session: Titel (auto-generiert) + Nachrichtenanzahl
- Aktionen: Click (open) / Rename / Delete / Export

### Speicherung
- JSON-Datei in `context.globalStorageUri` (max 100 Sessions)
- Format: `Session[]` mit `id, title, createdAt, updatedAt, providerId, modelId, messages[]`
- Autosave nach jeder Nachricht

### Datenmodell
```typescript
Session { id, title, createdAt, updatedAt, providerId, modelId, systemPrompt?, messages[], tokenCount }
Message { id, role, content, attachments?, createdAt, tokens? }
Attachment { type, name, mimeType, data, size }
```

## 4. Settings-UI (Webview)

### Provider-Konfiguration pro Provider
| Feld | UI | Storage |
|------|----|---------|
| apiKey | Password-Feld (👁 toggle) | SecretStorage |
| baseUrl | Text-Input | Settings |
| model | Dropdown (auto-fetched + manuell) | Settings |
| maxTokens | Number-Input | Settings |
| temperature | Slider (0-2) | Settings |
| enabled | Toggle | Settings |

### Aktionen
- `[🔄 Fetch Models]` – Ruft `/v1/models` auf
- `[🧪 Test Connection]` – Sendet Test-Prompt, zeigt Latenz/Fehler
- `[+ Add Provider]` – Neuen Provider hinzufügen (Dropdown der bekannten + "Custom OpenAI-compatible")
- Delete / Disable Provider

### Allgemeine Einstellungen
- Default Provider
- System Prompt (Textarea)
- Session Limit (50/100/∞)
- Log-Level (debug/info/warn/error/none)

## 5. Commands & Shortcuts

| Befehl | ID | Keybinding |
|--------|----|------------|
| Chat öffnen | `apexagent.openChat` | `Ctrl+Shift+I` |
| Neuer Chat | `apexagent.newChat` | `Ctrl+Shift+N` |
| Code fragen | `apexagent.askSelection` | `Ctrl+Shift+K` |
| Regenerieren | `apexagent.regenerate` | `Ctrl+Shift+R` |
| Abbrechen | `apexagent.cancel` | `Escape` |
| Einstellungen | `apexagent.openSettings` | – |

### Menüs
- Editor/context: "Ask ApexAgent" (`askSelection`)
- Explorer/context: "Ask ApexAgent about this file"

## 6. Fehlerbehandlung

### Error-Typen
`AUTH_FAILED`, `RATE_LIMITED`, `MODEL_UNAVAILABLE`, `QUOTA_EXCEEDED`, `TIMEOUT`, `NETWORK`, `STREAM_ERROR`

### Retry-Strategie
- RATE_LIMITED: Exponential Backoff (1s/2s/4s, max 3 Versuche)
- TIMEOUT/NETWORK: 1-2 Wiederholungen
- AUTH_FAILED/QUOTA_EXCEEDED: Kein Retry

### UI-Feedback
Jeder Error-Typ hat eine spezifische Message im Chat (❌/⏳/⚠️/🌐) inkl. Action-Button (Settings öffnen, Retry, Provider wechseln).

## 7. Logging
- VS Code Output Channel: `apexagent-logs`
- Strukturiert: `[LEVEL] [Provider/Context] Timestamp message`
- Konfigurierbar via `apexagent.logLevel`
- Format: `debug | info | warn | error`

## 8. Testing

| Typ | Tool | Was |
|-----|------|-----|
| Unit | vitest | Provider-Logik, Session-Manager, Streaming-Parser |
| Integration | `@vscode/test-cli` | Commands, Webview-Bridge, Activation |
| Component | vitest + testing-library | React-Komponenten |
| E2E | (optional) Playwright | Full-UI im VS Code Web-Modus |

### CI (GitHub Actions)
- `npm run lint` → `npm run test:unit` → `npm run test:integration` → `vsce package`

## 9. Projekt-Struktur

```
apexagent-vscode/
├── AGENTS.md                     ← Lernsystem (autonom verwaltet)
├── package.json                  # Extension Manifest
├── esbuild.config.js
├── tsconfig.json
├── src/
│   ├── extension.ts
│   ├── providers/
│   │   ├── base-provider.ts
│   │   ├── openai-compatible.ts
│   │   ├── openrouter.ts
│   │   ├── nvidia-nim.ts
│   │   ├── opencode-zen.ts
│   │   ├── puter.ts
│   │   └── provider-manager.ts
│   ├── chat/
│   │   ├── chat-manager.ts
│   │   ├── session-manager.ts
│   │   └── streaming.ts
│   ├── views/
│   │   ├── session-tree.ts
│   │   └── webview/
│   │       ├── chat-panel.ts
│   │       ├── settings-panel.ts
│   │       └── app/             # React-App (separates Bundle)
│   │           ├── index.html
│   │           ├── index.tsx
│   │           ├── components/
│   │           ├── hooks/
│   │           ├── context/
│   │           └── styles/
│   └── utils/
│       ├── storage.ts
│       ├── secrets.ts
│       └── logger.ts
└── media/
```

## 10. Dependencies

**Runtime:** `react`, `react-dom`, `marked`, `highlight.js`
**Dev:** `typescript`, `esbuild`, `vitest`, `@vscode/test-cli`, `eslint`, `vsce`, `@types/vscode` + React-Typings.
Keine externen HTTP-Libraries (Fetch API in Node 18+).

## Meta: Lernsystem für den Agent

Die Datei `AGENTS.md` im Projekt-Root wird **autonom** vom implementierenden Agent verwaltet:

1. **Vor jedem Task**: Agent liest `AGENTS.md`
2. **Bei Fehlern** (z.B. Befehl fehlgeschlagen): Agent dokumentiert den Fehler + Korrektur automatisch in `AGENTS.md`
3. **Bei neuen Erkenntnissen**: Agent ergänzt Projekt-Konventionen und Best Practices
4. **Format**:
   ```markdown
   # Agent Learnings
   
   ## 2026-07-01: PowerShell - kein `&&`
   - Problem: `&&` funktioniert in PowerShell nicht
   - Lösung: `;` oder `|` verwenden, oder Bash preferred
   
   ## Projekt-Konventionen
   - `workdir` Parameter statt `cd` im bash-Tool
   ```
5. **Kein User-Zutun erforderlich** – vollständig autonom

## Implementierungs-Reihenfolge (empfohlen)

1. **Scaffolding**: `package.json`, `tsconfig.json`, `esbuild.config.js`, Extension-Activation
2. **Provider-System**: BaseProvider, OpenAICompatibleProvider, ProviderManager
3. **OpenRouter-Adapter**: Erster funktionierender Provider
4. **Chat-Panel**: Webview-Host + React-Grundgerüst + Streaming
5. **NVIDIA / OpenCode Zen / Puter-Adapter**: Weitere Provider
6. **Settings-UI**: Provider-Konfiguration, API-Key-Management
7. **Session-Management**: Persistenz, Tree-View
8. **Markdown + Syntax-Highlighting**: Nachrichten-Rendering
9. **Attachments**: File-Upload für Vision-Modelle
10. **Commands, Menüs, Shortcuts**: VS Code Integration
11. **Fehlerbehandlung + Logging**: Vollständiges Error-Handling
12. **Tests**: Unit + Integration
13. **CI/CD**: GitHub Actions
14. **AGENTS.md initialisieren & Lernsystem aktivieren**
