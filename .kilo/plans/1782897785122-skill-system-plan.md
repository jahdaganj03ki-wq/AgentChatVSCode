# Plan: Skill System for ApexAgent

## Goal
Enable ApexAgent to **automatically discover, install, and activate skills** (knowledge packs) based on user prompts — compatible with the community standard used by Codex, Claude Code, Copilot, Kilo Code, OpenCode, and ZCode.

## Key Decisions

| Decision | Choice |
|----------|--------|
| Skill format | Community standard: `skills/<name>/SKILL.md` (YAML frontmatter) + references/ + scripts/ |
| Skill directories | `.apexagent/skills/` + all known dirs (`.kilo/`, `.codex/`, `.claude/`, `.github/`, `.opencode/`) |
| Skill scope | Knowledge-only (instructions/context, no custom tool handlers) |
| Auto-install methods | npx CLI + git clone + HTTP fetch |
| Intent detection | Pre-processing pipeline (keyword → LLM fallback) + agent tools (`search_skills`, `install_skill`) |
| Skill registry | GitHub Search + configured URLs + community API endpoint |
| Custom paths | Yes, via `apexagent.skills.paths` setting |
| Skill injection | Full SKILL.md content into system prompt |
| Activation | Auto (from prompt + project context) + Manual (dropdown UI) |
| Root files (CLAUDE.md) | NOT auto-detected as skills |

## Skill Format (Community Standard)

```
skills/<name>/
  SKILL.md             ← YAML frontmatter + markdown content
  references/           ← Optional: reference docs (INDEX.md, leaf files)
  scripts/              ← Optional: automation scripts (Python, Shell, etc.)
```

**Frontmatter:**
```yaml
---
name: orchard-core-theming
description: Evidence-first Orchard Core theming skill...
license: MIT
metadata:
  author: Lombiq Technologies
  version: "1.0"
tags: [orchard-core, theming, dotnet]
---
```

## Architecture

### New Module: `src/skills/`

```
src/skills/
├── types.ts                    # All type definitions
├── skill-manager.ts             # Core: discovery, CRUD, activation, persistence
├── skill-installer.ts           # Auto-install (npx, git, HTTP)
├── skill-resolver.ts            # Intent + context matching
├── skill-registry.ts            # Search across registries (GitHub, URLs, API)
├── format-parsers/
│   ├── skill-md-parser.ts       # Standard SKILL.md parser
│   ├── claude-parser.ts         # Claude Code format support
│   ├── codex-parser.ts          # Codex knowledge pack format
│   └── zcode-parser.ts          # ZCode format support
```

### Key Types (`src/skills/types.ts`)

```typescript
export type SkillFormat = 'kilo' | 'codex' | 'claude' | 'zcode' | 'opencode';
export type SkillState = 'discovered' | 'installed' | 'active' | 'error';

export interface Skill {
  name: string;
  description: string;
  format: SkillFormat;
  tags: string[];
  content: string;             // Full SKILL.md body
  references: SkillFile[];
  scripts: SkillFile[];
  directory: string;
  source: SkillSource;
  state: SkillState;
  installedAt: string;
  metadata: { author?: string; version?: string; license?: string };
}

export interface SkillFile {
  path: string;
  content: string;
  language?: string;
}

export type SkillSource =
  | { type: 'local'; path: string }
  | { type: 'git'; repo: string; ref?: string }
  | { type: 'url'; url: string }
  | { type: 'npx'; package: string };

export interface SkillInfo {
  name: string;
  description: string;
  tags: string[];
  state: SkillState;
  source?: string;
}
```

### Scan Directories (Priority Order)

| Priority | Path |
|----------|------|
| 1 (highest) | `.apexagent/skills/<name>/` (project) |
| 2 | `.kilo/skills/<name>/` (Kilo Code compat) |
| 3 | `.codex/skills/<name>/` (Codex compat) |
| 4 | `.claude/skills/<name>/` (Claude Code compat) |
| 5 | `.github/skills/<name>/` (Copilot compat) |
| 6 | `.opencode/skills/<name>/` (OpenCode legacy) |
| 7 | `~/.apexagent/skills/<name>/` (global) |
| 8 | `~/.config/kilo/skills/<name>/` (Kilo global) |
| 9 | `~/.codex/skills/<name>/` (Codex global) |
| 10 | `~/.claude/skills/<name>/` (Claude global) |
| 11 | `~/.github/skills/<name>/` (Copilot global) |
| 12+ | Custom paths from `apexagent.skills.paths` |

### Skill Manager (`skill-manager.ts`)

```typescript
class SkillManager {
  // Discovery — scan all directories
  async discover(): Promise<SkillInfo[]>

  // CRUD
  async install(source: string, scope?: 'project' | 'global'): Promise<Skill>
  async uninstall(name: string): Promise<void>
  async update(name: string): Promise<Skill>
  async search(query: string): Promise<SkillInfo[]>

  // Activation
  async activate(name: string): Promise<void>
  async deactivate(name: string): Promise<void>
  setActiveSkills(names: string[]): void
  getActiveSkills(): Skill[]

  // Queries
  getInstalled(): SkillInfo[]
  get(name: string): Skill | undefined
  getAll(): SkillInfo[]

  // Persistence
  async save(): Promise<void>
  async load(): Promise<void>
}
```

## Auto-Install Flow — 3 Implementations

### 1. Skill Installer (`skill-installer.ts`)

```
Source string → resolveSourceType()
  → tryNpxInstall(source)          // if npx available → run `npx skills add <source>`
  → tryGitClone(source)            // `git clone --depth 1 <repo>` 
  → tryHttpFetch(source)           // download SKILL.md + refs by URL
  → if all fail: return error with diagnostics
```

**Source resolution:**
```
Lombiq/Orchard-Core-Agent-Skills     → git (GitHub shorthand)
https://github.com/owner/repo        → git (full URL)
https://example.com/skills/x/SKILL.md → http
@scope/skill-package                  → npm
npx:skills/add source                 → npx delegate
./path/to/skills/foo                  → local copy
```

**Target selection:**
- Project scope: `.apexagent/skills/<name>/`
- Global scope: `~/.apexagent/skills/<name>/`
- Ask user if workspace open, else default to global

**Validation after install:**
1. Verify `skills/<name>/SKILL.md` exists
2. Parse YAML frontmatter (must have `name`, `description`)
3. Validate name matches directory
4. Index into SkillManager

### 2. Skill Registry (`skill-registry.ts`)

Three search sources:

```typescript
interface SkillRegistry {
  // 1. GitHub — search for repos with skills/ dir
  searchGithub(query: string): Promise<SkillInfo[]>

  // 2. Configured URLs — fetch from known registries
  searchUrls(query: string): Promise<SkillInfo[]>

  // 3. Community API — central registry endpoint
  searchCommunity(query: string): Promise<SkillInfo[]>
}
```

**GitHub Search:**
```
GET https://api.github.com/search/repositories?q=skills/SKILL.md+in:path+{query}
→ Parse results, extract skill name/description from frontmatter
→ Rate limit handling: cache results, respect X-RateLimit-Remaining
```

**Community Registry (future):**
```
GET https://registry.apexagent.dev/v1/skills?q={query}
→ Returns structured SkillInfo[]
```

**Configured URLs:**
```json
"apexagent.skills.urls": [
  "https://skills.example.com/registry.json",
  "https://raw.githubusercontent.com/community/skill-index/main/skills.json"
]
```

### 3. Intent Detection (Dual Path)

```
User sends message
│
├─▶ [A] Pre-Processing Pipeline (automatic)
│     1. Keyword matching: skill tags + description → prompt
│     2. If confidence > 0.8: auto-install & activate
│     3. If 0.3 < confidence < 0.8: call mini-LLM for classification
│     4. If confidence < 0.3: do nothing (let agent handle via tools)
│     5. Proceed with LLM call (skills in system prompt)
│
└─▶ [B] Agent Tools (during conversation)
      - Agent calls search_skills(query)
      - Agent calls install_skill(source)
      - Agent calls activate_skill(name)
      - Agent uses skill context for task
```

**Keyword matching algorithm:**
```
1. Extract keywords from user prompt (NLP-lite: split, stem, remove stop words)
2. For each installed/discovered skill: match keywords against name + tags + description
3. Score = (matchedKeywords / totalKeywords) * weight(name match: 3x, tag match: 2x, desc: 1x)
4. If score > threshold (0.8): auto-activate
5. If score > 0.3 but < 0.8: invoke mini-LLM
6. Mini-LLM prompt: "Given user request '{prompt}', which of these skills are relevant? [list]"
```

## Integration with Chat Flow

### ChatManager Changes

```typescript
class ChatManager {
  private skillManager: SkillManager;

  async sendMessage(userContent: string, callbacks: StreamCallback, attachments?: Attachment[]) {
    // Step 1: Pre-processing — detect matching skills
    const relevantSkills = await this.skillManager.resolveForPrompt(userContent);
    for (const skill of relevantSkills) {
      if (skill.state === 'discovered') {
        await this.skillManager.install(skill.source);
      }
      await this.skillManager.activate(skill.name);
    }

    // Step 2: Build system prompt with active skills
    const systemPrompt = this.buildSystemPromptWithSkills();

    // Step 3: Normal send flow with skills in context
    // ... existing sendMessage logic ...
  }

  private buildSystemPromptWithSkills(): string {
    const activeSkills = this.skillManager.getActiveSkills();
    if (activeSkills.length === 0) return this.defaultSystemPrompt;

    const skillBlocks = activeSkills.map(s =>
      `--- BEGIN SKILL: ${s.name} ---\n${s.content}\n--- END SKILL: ${s.name} ---`
    ).join('\n\n');

    return `${skillBlocks}\n\n${this.defaultSystemPrompt}`;
  }
}
```

### Agent Tools (Phase 2 Tool System)

| Tool | Description | Parameters |
|------|-------------|------------|
| `search_skills` | Search for available skills | `{ query: string }` |
| `install_skill` | Download and install a skill | `{ source: string, scope?: 'project' \| 'global' }` |
| `uninstall_skill` | Remove an installed skill | `{ name: string }` |
| `activate_skill` | Activate a skill for current session | `{ name: string }` |
| `deactivate_skill` | Deactivate a skill | `{ name: string }` |
| `list_skills` | List installed/available skills | `{ installed?: boolean, query?: string }` |

## Extension Side Changes

### Files to Create
- `src/skills/types.ts`
- `src/skills/skill-manager.ts`
- `src/skills/skill-installer.ts`
- `src/skills/skill-resolver.ts`
- `src/skills/skill-registry.ts`
- `src/skills/format-parsers/skill-md-parser.ts`
- `src/skills/format-parsers/claude-parser.ts`
- `src/skills/format-parsers/codex-parser.ts`
- `src/skills/format-parsers/zcode-parser.ts`

### Files to Modify
- `src/extension.ts` — Initialize SkillManager, register commands
- `src/chat/chat-manager.ts` — Pre-processing pipeline, skill injection
- `src/views/webview/chat-view-provider.ts` — Handle skill messages

### New Message Types

**Extension → Webview:**
```typescript
| { type: 'skill-list'; skills: SkillInfo[] }
| { type: 'skill-installed'; skill: SkillInfo }
| { type: 'skill-activated'; names: string[] }
| { type: 'skill-install-progress'; name: string; status: 'downloading' | 'installing' | 'error'; message?: string }
```

**Webview → Extension:**
```typescript
| { type: 'list-skills' }
| { type: 'install-skill'; source: string; scope?: 'project' | 'global' }
| { type: 'uninstall-skill'; name: string }
| { type: 'activate-skill'; names: string[] }
| { type: 'deactivate-skill'; names: string[] }
| { type: 'search-skills'; query: string }
```

### New Commands
- `apexagent.installSkill` — Install a skill from source input
- `apexagent.searchSkills` — Search for skills via quick pick

## Webview Side Changes

### Files to Create
- `src/views/webview/app/components/SkillSelector.tsx` — Dropdown in header
- `src/views/webview/app/components/SkillInstallDialog.tsx` — Install modal

### Files to Modify
- `src/views/webview/app/types.ts` — Add `SkillInfo`, skill message types
- `src/views/webview/app/components/ChatView.tsx` — Add skills dropdown
- `src/views/webview/app/components/App.tsx` — Handle skill messages
- `src/views/webview/app/context/ChatContext.tsx` — Add skill state + actions

### SkillSelector Component

```
Header: [← Sessions] [🧠 Skills (2/5)] [Model ▼] [+]

Skills Dropdown:
┌─────────────────────────────────────┐
│ 🧠 Active Skills (2/5 max)          │
│                                     │
│ ☑ orchard-core-theming   🟢 active  │
│   Evidence-first Orchard Core...    │
│ ☐ python-best-practices  ⚪ idle    │
│   Python coding standards...        │
│ ☐ reverse-engineering    🔴 error   │
│   Install failed: 404               │
│                                     │
│ ─────────────────────────────────── │
│ [+ Install Skill...]                │
│ [🔍 Search Registry...]             │
└─────────────────────────────────────┘
```

## Settings (`package.json`)

```json
{
  "apexagent.skills.enabled": { "type": "boolean", "default": true },
  "apexagent.skills.autoInstall": { "type": "boolean", "default": true },
  "apexagent.skills.autoActivate": { "type": "boolean", "default": true },
  "apexagent.skills.maxActive": { "type": "number", "default": 5 },
  "apexagent.skills.maxTokens": { "type": "number", "default": 8000 },
  "apexagent.skills.paths": { "type": "array", "items": { "type": "string" }, "default": [] },
  "apexagent.skills.urls": { "type": "array", "items": { "type": "string" }, "default": [] },
  "apexagent.skills.installMethod": { "type": "array", "items": { "type": "string", "enum": ["npx", "git", "http"] }, "default": ["npx", "git", "http"] },
  "apexagent.skills.allowScripts": { "type": "boolean", "default": false }
}
```

## Error Scenarios

| Error | Handling |
|-------|----------|
| npx not found | Fallback to git clone |
| Git not found | Fallback to HTTP fetch |
| HTTP 404 | Show error: "Skill not found at <source>" |
| Invalid SKILL.md | Skip skill, log warning, show in UI as error state |
| Duplicate name | Project overrides global; show warning |
| Disk full / permission | Show error, offer global install |
| Network timeout | Retry with backoff (1s/3s/5s), 3 attempts |
| GitHub API rate limit | Cache results, show "search degraded" note |
| Skill requires scripts blocked | Show "scripts blocked" note, skill still usable for knowledge |

## Implementation Order

### Step 1: Types + Parsers
- `src/skills/types.ts`
- `src/skills/format-parsers/skill-md-parser.ts`
- `src/skills/format-parsers/claude-parser.ts`
- `src/skills/format-parsers/codex-parser.ts`
- `src/skills/format-parsers/zcode-parser.ts`

### Step 2: Skill Manager
- `src/skills/skill-manager.ts` — Discovery, CRUD, activation, persistence
- Directory scanning, state management

### Step 3: Skill Installer
- `src/skills/skill-installer.ts` — npx, git, HTTP strategies
- Source resolution, validation, target selection

### Step 4: Skill Registry
- `src/skills/skill-registry.ts` — GitHub search, URL fetch, community API
- Caching, rate limiting

### Step 5: Skill Resolver (Pre-Processing)
- `src/skills/skill-resolver.ts` — Keyword matching + mini-LLM fallback
- Integration with ChatManager.sendMessage

### Step 6: Chat Integration
- Modify `src/chat/chat-manager.ts` — System prompt injection
- Pre-processing pipeline call

### Step 7: Extension Messages
- Modify `src/views/webview/chat-view-provider.ts`
- Wire SkillManager to webview messages

### Step 8: Webview UI
- `SkillSelector.tsx` — Dropdown with active/idle/error states
- `SkillInstallDialog.tsx` — Install modal
- Update ChatView, App, ChatContext

### Step 9: Agent Tools
- Register `search_skills`, `install_skill`, `activate_skill`, `list_skills` tools
- Tools available in Phase 2 tool calling system

### Step 10: Settings + Commands
- `package.json` configuration properties
- `apexagent.installSkill`, `apexagent.searchSkills` commands

### Step 11: Tests
- `src/__tests__/skills/skill-manager.test.ts`
- `src/__tests__/skills/format-parsers.test.ts`
- `src/__tests__/skills/skill-installer.test.ts`
- `src/__tests__/skills/skill-resolver.test.ts`
- `src/__tests__/skills/skill-registry.test.ts`
- `src/__tests__/chat-manager.test.ts` (skill injection)

## Dependencies

### Phase 2 prerequisite
The Agent Tools (`search_skills`, `install_skill`, etc.) depend on Phase 2's tool calling system. However, the pre-processing pipeline, Skill Manager, installer, and UI can be built independently before Phase 2.

### Runtime dependencies (add to package.json)
- None required for core functionality (Node.js built-in `fetch`, `child_process` for git/npx)
- Optional: `simple-git` (npm) if native git bindings preferred over CLI calls

## Open Questions
- Community registry endpoint URL (TBD — can be configured later via settings default)
- GitHub API token for search (can use unauthenticated with lower rate limits; recommend optional token in settings)
