# browclaw

**Local-first, no-cost AI in the browser.** Run [Ollama](https://ollama.com) on your machine, point browclaw at it, and chat with no API keys and no cloud. Optional: use Anthropic for cloud models.

Browser-native personal AI assistant. Zero infrastructure — the browser is the server. Same idea as NanoClaw/OpenBrowserClaw: small, single-user, understandable; runs entirely in a browser tab.

## Quick Start (Ollama — local, free)

1. Install and run [Ollama](https://ollama.com), and pull a model, e.g. `ollama pull llama3.2`.
2. Clone and run browclaw:

```bash
cd browclaw
npm install
npm run dev
```

3. Open `http://localhost:5173`, go to **Settings**, choose **Ollama (Local)** and set **Ollama URL** (default `http://localhost:11434`). Pick your model name (e.g. `llama3.2`) and start chatting.

No API key required. Data stays on your machine.

## Optional: Anthropic (cloud)

In Settings you can switch to **Anthropic** and paste an [API key](https://console.anthropic.com/) to use Claude instead of or in addition to Ollama.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Browser Tab (PWA)                                       │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐  │
│  │ Chat UI  │  │ Settings │  │ Task Manager           │  │
│  └────┬─────┘  └─────┬────┘  └───────┬────────────────┘  │
│       └──────────────┼───────────────┘                   │
│                      ▼                                   │
│              Orchestrator (main thread)                  │
│              ├── Message queue & routing                 │
│              ├── State machine (idle/thinking/responding)│
│              └── Task scheduler (cron)                   │
│                      │                                   │
│          ┌───────────┼───────────┐                       │
│          ▼           ▼           ▼                       │
│     IndexedDB      OPFS    Agent Worker                  │
│     (messages,   (group    (Ollama / Anthropic API       │
│      tasks,       files,    tool-use loop,               │
│      config)     memory)    WebVM sandbox)               │
│                                                          │
│  Channels:                                               │
│  ├── Browser Chat (built-in)                             │
│  └── Telegram Bot API (optional, pure HTTPS)              │
└──────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point, bootstraps UI |
| `src/orchestrator.ts` | State machine, message routing, agent invocation |
| `src/agent-worker.ts` | Web Worker: Ollama / Anthropic tool-use loop |
| `src/tools.ts` | Tool definitions (bash, read/write files, fetch, etc.) |
| `src/vm.ts` | WebVM wrapper (v86 Alpine Linux in WASM) |
| `src/db.ts` | IndexedDB: messages, sessions, tasks, config |
| `src/storage.ts` | OPFS: per-group file storage |
| `src/router.ts` | Routes messages to correct channel |
| `src/channels/browser-chat.ts` | In-browser chat channel |
| `src/channels/telegram.ts` | Telegram Bot API channel |
| `src/task-scheduler.ts` | Cron expression evaluation |
| `src/crypto.ts` | AES-256-GCM encryption for stored credentials |
| `src/ui/` | Chat, settings, and task manager components |

## How It Works

1. **You type a message** in the browser chat (or send one via Telegram)
2. **The orchestrator** checks the trigger pattern, saves to IndexedDB, queues for processing
3. **The agent worker** sends your message + history to Ollama or Anthropic
4. **The model responds**, possibly using tools (bash, file I/O, fetch, JavaScript)
5. **Tool results** are fed back in a loop until a final text response
6. **The response** is routed back to the originating channel (browser chat or Telegram)

## Tools

| Tool | What it does |
|------|-------------|
| `bash` | Execute shell commands in a sandboxed Linux VM (Alpine in WASM) |
| `javascript` | Execute JS code in an isolated scope (lighter than bash) |
| `read_file` / `write_file` / `list_files` | Manage files in OPFS per-group workspace |
| `fetch_url` | HTTP requests via browser `fetch()` (subject to CORS) |
| `update_memory` | Persist context to CLAUDE.md (loaded on every conversation) |
| `create_task` | Schedule recurring tasks with cron expressions |

## Telegram

Optional. Works entirely via HTTPS — no WebSockets or special protocols.

1. Create a bot with `@BotFather` on Telegram
2. Open Settings in browclaw, paste the bot token
3. Send `/chatid` to your bot to get the chat ID
4. Add the chat ID in Settings
5. Messages from Telegram are processed the same as browser chat

**Caveat**: The browser tab must be open for the bot to respond. Messages queue on Telegram's side and are processed when you reopen the tab.

## WebVM (Optional)

The `bash` tool runs commands in a v86-emulated Alpine Linux. To enable:

1. Download the v86 WASM binary and Alpine rootfs image
2. Place them in `public/assets/`:
   - `public/assets/v86.wasm`
   - `public/assets/v86/libv86.js`
   - `public/assets/alpine-rootfs.ext2`
3. The VM boots automatically on first use (~5-15 seconds)

Without these assets, the `bash` tool returns a helpful error. All other tools work without the VM.

## Comparison with NanoClaw / OpenBrowserClaw

| | NanoClaw | browclaw (this fork) |
|---|---|---|
| Runtime | Node.js process | Browser tab |
| Agent sandbox | Docker/Apple Container | Web Worker + WebVM |
| Database | SQLite (better-sqlite3) | IndexedDB |
| Files | Filesystem | OPFS |
| Primary channel | WhatsApp | In-browser chat |
| Other channels | Telegram, Discord | Telegram |
| Agent SDK | Claude Agent SDK | Ollama API / Raw Anthropic API |
| Background tasks | launchd service | setInterval (tab must be open) |
| Deployment | Self-hosted server | Static files (any CDN) |
| Dependencies | ~50 npm packages | 0 runtime deps |

## Development

```bash
npm run dev        # Vite dev server with HMR
npm run build      # Production build → dist/
npm run preview    # Preview production build
npm run typecheck  # TypeScript type checking
```

## Deploy

```bash
npm run build
# Upload dist/ to any static host:
# GitHub Pages, Cloudflare Pages, Netlify, Vercel, S3, etc.
```

No server needed. It's just HTML, CSS, and JS.

## Security

browclaw is a proof of concept. With Ollama, data stays on your machine; with Anthropic, only the API sees your requests. Current security posture:

**What it does:**
- API keys (Anthropic) are encrypted at rest with AES-256-GCM using a non-extractable `CryptoKey` stored in IndexedDB. JavaScript cannot export the raw key material.
- All storage (IndexedDB, OPFS) is same-origin scoped by the browser.
- The agent runs in a Web Worker, separate from the UI thread.

**What it doesn't do (yet):**
- The encryption protects against casual inspection (DevTools, disk forensics) but not a full XSS attack on the same origin; an attacker with script execution could call the encrypt/decrypt API.
- The `javascript` tool runs `eval()` in the Worker, which has access to `fetch()`. Claude can make arbitrary HTTP requests through the JS tool regardless of any `fetch_url` restrictions.
- Outgoing HTTP requests (via `fetch_url` or the JS tool) have no user confirmation step.
- The Telegram bot token is currently stored in plaintext.

This is a single-user local tool, not a multi-tenant platform. Contributions to improve the security model are welcome.

---

**Fork:** browclaw is a fork of [OpenBrowserClaw](https://github.com/nanoclaw/openbrowserclaw). It emphasizes local-first, no-cost usage with Ollama while keeping optional Anthropic support.
