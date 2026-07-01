# Agent Learnings

## 2026-07-01: Project Scaffolding - ApexAgent VS Code Extension
- **Project**: Greenfield VS Code Extension "ApexAgent" (`apexagent.apexagent-vscode`)
- **Language**: TypeScript
- **Build**: ESBuild (two bundles: extension host + webview)
- **UI**: React 18 + Webview
- **VS Code Engine**: ^1.95.0
- **License**: MIT
- **Publisher**: `apexagent`

## Project Conventions
- `workdir` parameter instead of `cd` in bash tool
- No `&&` in PowerShell - use `;` instead, or prefer bash
- Always read `AGENTS.md` before starting any task
- ESBuild config at root: `esbuild.config.js`
- Two separate bundles: `src/extension.ts` (Node) and `src/views/webview/app/index.tsx` (browser)
- API keys stored in SecretStorage (primary) with Settings.json fallback
- SSE streaming required for all providers
- CSP header mandatory in webview construction
- Error types: `AUTH_FAILED`, `RATE_LIMITED`, `MODEL_UNAVAILABLE`, `QUOTA_EXCEEDED`, `TIMEOUT`, `NETWORK`, `STREAM_ERROR`
- Settings panel is a separate esbuild entry point: `src/views/webview/app/settings.tsx`
- `marked` v14+ uses `marked-highlight` extension for syntax highlighting (not `highlight` option)
- Session IDs must include a counter suffix (`_N`) because `Date.now()` can return the same value in rapid succession
- Tests with mocked `fs` need shared state reset in `beforeEach` to avoid cross-test contamination
- `context.subscriptions` in VS Code API may conflict with `@vscode/test-cli` types; use `(context as any).subscriptions`
- Retry strategy: RATE_LIMITED/NETWORK/TIMEOUT get exponential backoff (1s/2s/4s, max 3 attempts); AUTH_FAILED/QUOTA_EXCEEDED do not retry
- vitest config needs `globals: true` for `@vscode/test-cli` compatibility
