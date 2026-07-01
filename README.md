# ApexAgent

Multi-Provider Chat Panel with a focus on free models. Chat with AI models from OpenRouter, Google Gemini, and more directly inside VS Code.

## Features

- Multi-provider AI chat (OpenRouter, Gemini, and more)
- SSE streaming responses
- Session management with history
- Code syntax highlighting
- Theme-aware UI

## Commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| ApexAgent: Open Chat | Ctrl+Shift+I | Open the chat panel |
| ApexAgent: New Chat | Ctrl+Shift+N | Start a new chat session |
| ApexAgent: Ask about Selection | Ctrl+Shift+K | Ask about selected code |
| ApexAgent: Regenerate Last Response | Ctrl+Shift+R | Regenerate the last response |
| ApexAgent: Cancel Streaming | Escape | Cancel ongoing streaming |
| ApexAgent: Open Settings | — | Open provider settings |

## Requirements

- VS Code 1.95.0 or higher
- An API key for your chosen provider

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `apexagent.logLevel` | `info` | Log level for output channel |
| `apexagent.defaultProvider` | `openrouter` | Default provider ID |
| `apexagent.systemPrompt` | `You are a helpful AI assistant.` | Default system prompt |
| `apexagent.sessionLimit` | `100` | Maximum stored sessions |
