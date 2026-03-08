# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Ross

Ross is a desktop GUI for [Codex](https://github.com/openai/codex) (OpenAI's coding agent). It's an Electron app that spawns `codex app-server` as a child process, communicates over JSON-RPC via stdio, and presents a chat UI with streaming, command approvals, voice input, and skills discovery.

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Run in development mode (electron-vite dev)
pnpm build            # Typecheck + build (electron-vite build)
pnpm build:mac        # Build distributable for macOS
pnpm lint             # ESLint (flat config, cached)
pnpm format           # Prettier
pnpm typecheck        # Full typecheck (both node + web tsconfigs)
pnpm typecheck:node   # Typecheck main/preload only
pnpm typecheck:web    # Typecheck renderer only
```

## Architecture

Three-process Electron app built with `electron-vite`:

```
Renderer (React 19 + Zustand + Tailwind v4)
  -> window.codex.* (contextBridge in preload)
    -> ipcMain handlers (main/index.ts)
      -> CodexServer (main/codex-server.ts)
        -> codex app-server (child process, JSON-RPC over stdio)
```

### Main process (`src/main/`)

- `index.ts` — Electron bootstrap, all `ipcMain.handle('codex:*')` handlers
- `codex-server.ts` — `CodexServer` class: spawns `codex app-server`, sends JSON-RPC requests, forwards server notifications to renderer as `codex:event`, handles thread-remap recovery on `turnStart`
- `auth.ts` — Checks `~/.codex/auth.json` existence, spawns `codex login`
- `transcribe.ts` — Runs local transcription through `ffmpeg` and `whisper.cpp`

### Preload (`src/preload/index.ts`)

- Exposes typed `window.codex` API via `contextBridge`. The `CodexApi` type is exported from this file.

### Renderer (`src/renderer/src/`)

- `App.tsx` — Central event reducer for all `codex:event` streaming notifications (turn/started, item/delta, item/completed, etc.). This is the canonical place for stream handling.
- `lib/store.ts` — Single Zustand store (`useCodexStore`) with `persist` middleware. Holds threads, messages, message items, UI state. Persisted keys: threads, activeTab, activeProject, recentProjects, model, autonomyLevel, isSidebarOpen.
- `lib/animations.ts` — Shared animation constants for framer-motion
- `components/chat.tsx` — Chat input, model loading, thread bootstrap, voice recording/transcription
- `components/message.tsx` — Message rendering with structured items
- `components/code-block.tsx` — Syntax highlighting via Shiki
- Path alias: `@/` and `@renderer/` both resolve to `src/renderer/src/`

## Key Conventions

- **Adding a new Codex RPC method** requires 4 steps: (1) `ipcMain.handle` in `main/index.ts`, (2) typed method in `preload/index.ts`, (3) call via `window.codex.*` in renderer, (4) extend `App.tsx` event switch if streaming events are involved. See `docs/CODEX_INTEGRATION.md` for the full recipe.
- **State immutability**: Zustand store uses nested structures (threads > messages > items). Always preserve immutability for React re-renders.
- **Single event reducer**: All streaming event handling lives in `App.tsx`'s `onEvent` callback. Do not duplicate stream handling elsewhere.
- **UI stack**: Tailwind v4 (via `@tailwindcss/vite`), shadcn/ui with Base UI primitives, framer-motion for animations, Lucide icons, Geist font.
- **No test framework** is currently configured.

## Prerequisites

- `codex` CLI must be on PATH (for `codex app-server` and `codex login`)
- Auth: `~/.codex/auth.json` must exist (created by `codex login`)
