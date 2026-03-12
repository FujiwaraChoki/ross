# Codex Integration Guide

This document explains how Codex is integrated into this Electron app and how to safely extend it.

## Goals

- Keep all Codex transport and process logic in `main`.
- Expose a minimal typed API to `renderer` via `preload`.
- Keep UI state updates deterministic in a single Zustand store.
- Support chat, command approvals, auth recovery, and skills discovery.

## Architecture Overview

```text
Renderer (React + Zustand)
  -> window.codex.* (preload bridge)
    -> ipcMain handlers (main/index.ts)
      -> CodexServer (main/codex-server.ts)
        -> codex app-server (child process)
          -> JSON-RPC notifications/events
            -> main forwards as 'codex:event'
              -> renderer event reducer in App.tsx
      -> optional host bridge
        -> `codex:ingest-event`
          -> main forwards as 'codex:event'
            -> same renderer event reducer in App.tsx
```

## Key Files

- `src/main/index.ts`
  - Electron bootstrapping.
  - IPC handlers (`codex:*`).
  - Starts/stops `CodexServer` with app lifecycle.
- `src/main/codex-server.ts`
  - Spawns `codex app-server`.
  - Sends JSON-RPC requests and resolves pending promises.
  - Forwards server notifications to renderer.
  - Adds thread-remap recovery behavior.
- `src/main/auth.ts`
  - Login/auth check shell integration (`codex login`, `~/.codex/auth.json`).
- `src/preload/index.ts`
  - Secure bridge API exposed as `window.codex`.
- `src/shared/codex-events.ts`
  - Shared `CodexEvent` contract for both app-server and host-bridge sources.
- `src/renderer/src/App.tsx`
  - Central event handling for streamed turn/item updates.
  - Auth bootstrap, server start, approval dialog wiring.
- `src/renderer/src/lib/store.ts`
  - Canonical app state (threads/messages/streaming/sidebar/tab/etc).
- `src/renderer/src/components/chat.tsx`
  - Chat input, model loading, turn start, thread bootstrap.
- `src/renderer/src/components/skills-tab.tsx`
  - Skills list UI powered by `skills/list`.

## IPC Contract (`window.codex`)

Current bridge methods in `src/preload/index.ts`:

- Auth/session
  - `isAuthenticated()`
  - `login()`
  - `startServer()`
  - `stopServer()`
- Thread/turn
  - `threadStart(params)`
  - `threadRead({ threadId, includeTurns? })`
  - `threadList(params?)`
  - `turnStart(params)`
  - `turnInterrupt({ threadId, turnId })`
- Metadata
  - `modelList()`
  - `mcpServerReload()`
  - `mcpServerStatusList(params?)`
  - `skillsList(params?)`
  - `skillsConfigWrite({ path, enabled })`
- Command approval
  - `approveCommand(params)`
  - `rejectCommand(params)`
- External/host event bridge
  - `ingestEvent(event)` forwards a normalized `CodexEvent` into the same `'codex:event'` channel used by app-server.
- Streaming events
  - `onEvent(callback)` (subscribes to `'codex:event'`)

`CodexEvent` shape:

```ts
type CodexEvent = {
  method: string
  params: Record<string, unknown>
  requestId?: number | string
  source?: 'appServer' | 'hostBridge'
}
```

## Startup and Auth Flow

1. `App.tsx` calls `window.codex.isAuthenticated()`.
2. If authenticated, renderer calls `window.codex.startServer()`.
3. `CodexServer.start()` spawns `codex app-server` and runs:
   - JSON-RPC `initialize`
   - JSON-RPC notification `initialized`
4. Startup is bounded by a 15s timeout. If initialize or the follow-up `initialized` notify stalls, main rejects startup, kills the child process, and emits `server/error` with `duringStartup: true`.
5. `isAuthenticated()` is only a cached-auth precheck based on `~/.codex/auth.json`. The session is only considered live after `startServer()` succeeds.
6. If stderr or JSON-RPC errors indicate token refresh/auth failure, main emits `auth/expired`.
7. Renderer handles `auth/expired` by clearing streaming/approval state, setting `serverReady` false, and returning to login UI.

## Turn and Streaming Flow

### Send message path

1. `chat.tsx` ensures thread exists (`threadStart` if needed).
2. It appends local user + assistant placeholder messages to store.
3. It calls `turnStart({ threadId, model, effort, input: [{ type: 'text', text }] })`.
   - Standard turns pass the reasoning override with top-level `effort`.
   - Plan mode mirrors the same selection through `collaborationMode.settings.reasoning_effort`, which takes precedence over the top-level override.

### Event path (`App.tsx`)

`onEvent` handles the streaming lifecycle:

- `turn/started`
  - marks streaming true, captures current assistant message id, and stores the active `turnId`.
- `item/started`
  - creates structured items (`agentMessage`, `commandExecution`, etc.) under assistant message.
- `item/agentMessage/delta`
  - appends streamed text either into an active `agentMessage` item or fallback message content.
- `item/commandExecution/outputDelta`
  - appends command output chunks to the matching item.
- `item/*/outputDelta`
  - generic tool output streaming for command, file, MCP, dynamic, collab, web, and image items.
- `item/completed`
  - marks item complete.
- `item/commandExecution/requestApproval`
  - opens approval dialog for shell commands.
- `item/fileChange/requestApproval`
  - opens approval dialog for patch application.
- `approval/request`
  - generic request-style approval events, including MCP tool approvals.
- `item/tool/call`
  - dynamic tool request from Codex to the client. Ross currently surfaces the request in the transcript and responds with an explicit unsupported result instead of hanging the turn.
- `turn/completed`
  - marks streaming complete and clears the active turn context. Interrupted turns are surfaced via `turn.status === 'interrupted'`; failed turns can also include a top-level `error` payload that should be rendered to the user instead of failing silently.
- `error`
  - may precede a failed `turn/completed` and carries the same structured Codex error payload.

### Approval protocol note

Recent Codex app-server builds send approvals as server-initiated JSON-RPC requests, not just fire-and-forget notifications. That means the integration must:

- forward the incoming request `id` from `main` to the renderer,
- keep enough request context in UI state to answer later,
- respond with a JSON-RPC result (`{ decision: 'accept' | 'decline' }`) when the user chooses.

Legacy `command/approve` / `command/reject` notifications can remain as a fallback for older server builds, but the request/response path is the reliable one for current Codex integration.

Legacy file-change approvals without a request id are treated as unsupported. Ross surfaces a compatibility error, fails the active turn, and does not attempt to send a side-channel fallback response.

## Thread Remap Recovery

Codex may remap thread IDs. This integration handles that in two places:

- `CodexServer.threadStart()` emits `thread/remapped` when requested and actual IDs differ.
- `CodexServer.turnStart()` retries on "thread not found" / "invalid thread id":
  - creates a fresh thread,
  - emits `thread/remapped`,
  - retries `turn/start` with new id.

Renderer receives `thread/remapped` and updates local store IDs via `remapThreadId`.

## Skills Tab Integration

### UI integration

- `store.ts` defines `activeTab: 'threads' | 'skills'`.
- Sidebar toggles between Threads and Skills.
- `App.tsx` renders `<SkillsTab />` when `activeTab === 'skills'`.

### Data integration

- `main/index.ts` exposes `codex:skills-list`.
- Handler forwards to JSON-RPC `skills/list` and defaults `cwds` to `[process.cwd()]` when omitted.
- `skills-tab.tsx` calls `window.codex.skillsList({ forceReload })`, then renders per-workspace entries and skill cards.
- `main/index.ts` also exposes `codex:skills-config-write`.
- Handler tries JSON-RPC `skills/config/write` with `{ path, enabled }`, then falls back to `config/read` + `config/batchWrite` for older backends that only expose generic config write methods.
- Fallback persistence mirrors Codex's current config shape: `[[skills.config]]` entries with `path` and `enabled`.
- `skills-tab.tsx` calls `window.codex.skillsConfigWrite(...)` when a switch is toggled and applies the returned `effectiveEnabled` state.

## MCP Servers Integration

- `main/index.ts` exposes `codex:mcp-server-reload` and `codex:mcp-server-status-list`.
- Reload forwards to JSON-RPC `config/mcpServer/reload`.
- Status listing forwards to JSON-RPC `mcpServerStatus/list`.
- `settings-tab.tsx` reads `config.mcp_servers` from `config/read`, writes targeted edits with `config/batchWrite`, and reloads the MCP runtime after changes.

## Adding a New Codex Endpoint (Recipe)

When adding any new Codex RPC method, do all 4 steps:

1. Main handler
   - Add `ipcMain.handle('codex:your-method', ...)` in `src/main/index.ts`.
   - Usually call `codexServer.request('rpc/method', params)`.
2. Preload bridge
   - Add a typed method in `src/preload/index.ts` that invokes the new IPC channel.
3. Renderer callsite
   - Use `window.codex.yourMethod(...)` from components/hooks.
4. State updates
   - If streaming notifications are involved, extend `App.tsx` event switch.

If only command-like behavior is needed (no request/response), prefer `notify` with a dedicated IPC route.

If the event source is not `codex app-server` itself, prefer adapting it into `CodexEvent` and feeding it through `codex:ingest-event` rather than creating a second renderer reducer. That keeps transcript handling source-agnostic.

## State Model Notes

`store.ts` stores:

- Conversation entities: threads, messages, message items.
- Session UI state: active thread/tab, model, autonomy level, streaming, sidebar, auth.
- Approval state: pending approval request payload (commands and file changes).

Persistence currently includes:

- `threads`
- `activeTab`
- `model`
- `reasoningEffort`
- `autonomyLevel`
- `isSidebarOpen`

## Operational Notes and Gotchas

- `CodexServer.request()` throws if app-server is not running; ensure server startup before calling data methods.
- `CodexServer.request()` applies method-specific timeouts:
  - `initialize`: 15s
  - metadata reads (`model/*`, `config/*`, `skills/*`, `mcpServerStatus/*`, `thread/read`, `thread/list`): 10s
  - turn/thread control (`thread/start`, `turn/start`, `turn/interrupt`): 20s
- Thread creation can race if multiple send paths are added; keep one thread-bootstrap path.
- Be careful when mutating nested store structures; preserve immutability for React updates.
- `onEvent` in `App.tsx` is the canonical reducer; avoid duplicating stream handling elsewhere.
- For skills listing, prefer explicit `cwds` if multi-workspace support is introduced.
- `server/error` and `server/stopped` now include `intentional`, `duringStartup`, and `recoverable`. Renderer reconnect behavior should use those flags instead of inferring from message text.
- Renderer treats `serverReady` as the send gate. Draft input remains editable while the transport is offline, but sends and queued follow-up dispatch are blocked.
- Ross performs at most one automatic reconnect attempt 750ms after an unexpected recoverable stop/error. After that, reconnect is manual.

## Troubleshooting Quick Checks

- Login issues:
  - Verify `~/.codex/auth.json` exists.
  - Re-run `codex login`.
- No model/skills data:
  - Confirm `window.codex.startServer()` resolved.
  - Check app-server process spawn (`codex` on PATH).
- Stuck streaming:
  - Ensure `turn/completed` is being received.
  - If the server exits mid-turn, ensure `server/stopped` or equivalent cleanup reaches renderer so `isStreaming` is cleared.
  - Verify active thread/message IDs are valid.
- Startup hangs:
  - Check for a timed-out `initialize` request in Electron logs.
  - Retry after confirming `codex app-server` can launch manually in the shell.
- Command approval not showing:
  - Confirm event `item/commandExecution/requestApproval` reaches renderer.
  - Confirm file edit approvals (`item/fileChange/requestApproval`) are also handled.
  - If approval reaches renderer but the turn still does not continue, verify the client is replying to the server request id instead of only sending a side-channel notify.
- File approval immediately fails:
  - Check whether the event arrived without a JSON-RPC `requestId`.
  - That indicates an unsupported legacy file-approval flow; reconnect or upgrade Codex and retry.

## Reference: Events Currently Handled in Renderer

- `turn/started`
- `item/agentMessage/delta`
- `item/started`
- `item/completed`
- `item/commandExecution/outputDelta`
- `item/fileChange/outputDelta`
- `item/mcpToolCall/outputDelta`
- `item/dynamicToolCall/outputDelta`
- `item/collabToolCall/outputDelta`
- `item/webSearch/outputDelta`
- `item/imageView/outputDelta`
- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `approval/request`
- `item/tool/call`
- `turn/completed`
- `error`
- `auth/expired`
- `server/error`
- `server/stopped`
- `thread/remapped`

## Suggested Future Improvements

- Add explicit TypeScript interfaces for all RPC result payloads in a shared `types/codex.ts` file.
- Add integration tests for event reducer behavior in `App.tsx`.
- Add lightweight telemetry for start/stop/errors in `CodexServer`.
- Add pagination/filter/search to Skills tab when skill counts grow.
