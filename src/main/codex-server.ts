import { spawn, type ChildProcess } from 'child_process'
import readline from 'readline'
import { BrowserWindow } from 'electron'
import { appendFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import type { CodexEvent } from '../shared/codex-events'

interface JsonRpcMessage {
  jsonrpc?: string
  id?: number | string
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface RequestOptions {
  timeoutMs?: number
}

interface PendingRequest {
  method: string
  startedAt: number
  timeoutId: NodeJS.Timeout | null
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
}

interface TurnStartResultShape {
  turn?: {
    id?: unknown
    collaborationModeKind?: unknown
    collaboration_mode_kind?: unknown
  } | null
  collaborationModeKind?: unknown
  collaboration_mode_kind?: unknown
}

type ServerLifecycle = 'stopped' | 'starting' | 'ready' | 'stopping'

interface ServerEventFlags {
  intentional: boolean
  duringStartup: boolean
  recoverable: boolean
}

const STARTUP_TIMEOUT_MS = 15_000
const METADATA_TIMEOUT_MS = 10_000
const CONTROL_TIMEOUT_MS = 20_000
const DEBUG_EVENT_LOG_PATH = join(homedir(), 'Library/Application Support/ross/codex-events.ndjson')

function logPlanServer(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.log('[plan][server]', message, details)
    return
  }

  console.log('[plan][server]', message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function appendDebugEventLog(event: CodexEvent): Promise<void> {
  try {
    await mkdir(join(homedir(), 'Library/Application Support/ross'), { recursive: true })
    await appendFile(
      DEBUG_EVENT_LOG_PATH,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        source: event.source || 'appServer',
        method: event.method,
        requestId: event.requestId ?? null,
        params: event.params
      })}\n`,
      'utf8'
    )
  } catch (error) {
    console.error('Failed to append Codex debug event log:', error)
  }
}

export class CodexServer {
  private proc: ChildProcess | null = null
  private rl: readline.Interface | null = null
  private stderrRl: readline.Interface | null = null
  private requestId = 0
  private pendingRequests = new Map<number, PendingRequest>()
  private win: BrowserWindow | null = null
  private initPromise: Promise<void> | null = null
  private lifecycle: ServerLifecycle = 'stopped'
  private intentionalStop = false
  private lastAuthExpiredMessage = ''
  private lastAuthExpiredAt = 0

  setWindow(win: BrowserWindow): void {
    this.win = win
  }

  start(): Promise<void> {
    if (this.lifecycle === 'ready' && this.proc) {
      return Promise.resolve()
    }

    if (this.initPromise) {
      return this.initPromise
    }

    if (this.proc && this.lifecycle === 'stopping') {
      return Promise.reject(new Error('Codex server is stopping'))
    }

    const proc = spawn('codex', ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.proc = proc
    this.lifecycle = 'starting'
    this.intentionalStop = false

    proc.on('error', (err) => {
      if (this.proc !== proc) return

      console.error('[codex] Failed to start codex app-server:', err)
      this.failPendingRequests(err)
      this.emitServerError(err.message, {
        intentional: false,
        duringStartup: this.lifecycle === 'starting',
        recoverable: true
      })
      this.resetServerState()
    })

    proc.on('close', (code) => {
      if (this.proc !== proc) return

      const intentional = this.intentionalStop
      const duringStartup = this.lifecycle === 'starting'
      const recoverable = !intentional && !duringStartup

      console.log('codex app-server exited with code', code)
      this.failPendingRequests(new Error(`Codex server exited (code: ${code ?? 'unknown'})`))
      this.emitServerStopped(code, {
        intentional,
        duringStartup,
        recoverable
      })
      this.resetServerState()
    })

    this.rl = readline.createInterface({ input: proc.stdout! })
    this.rl.on('line', (line) => this.handleMessage(line))

    this.stderrRl = readline.createInterface({ input: proc.stderr! })
    this.stderrRl.on('line', (line) => this.handleStderr(line))

    this.initPromise = this.withTimeout(
      this.request('initialize', {
        clientInfo: { name: 'ross-desktop', title: 'Ross', version: '1.0.1' },
        capabilities: {
          experimentalApi: true
        }
      }),
      STARTUP_TIMEOUT_MS,
      'initialize'
    )
      .then((result) => {
        logPlanServer('Initialized app-server connection', {
          experimentalApi: true,
          result: isRecord(result) ? result : null
        })

        if (!this.send({ jsonrpc: '2.0', method: 'initialized', params: {} })) {
          throw new Error('Failed to send initialized notification to Codex server')
        }
      })
      .then(() => {
        this.lifecycle = 'ready'
      })
      .catch((error) => {
        const normalizedError = error instanceof Error ? error : new Error(String(error))
        const authFailure = this.isAuthFailure(normalizedError.message)

        if (authFailure) {
          this.emitAuthExpired(normalizedError.message, {
            intentional: false,
            duringStartup: true,
            recoverable: false
          })
        } else {
          this.emitServerError(normalizedError.message, {
            intentional: false,
            duringStartup: true,
            recoverable: true
          })
        }

        this.failPendingRequests(normalizedError)
        this.terminateProcess(proc)
        this.resetServerState()
        throw normalizedError
      })
      .finally(() => {
        if (this.lifecycle !== 'ready') {
          this.initPromise = null
        }
      })

    return this.initPromise
  }

  stop(): void {
    if (this.lifecycle === 'stopped' || this.lifecycle === 'stopping') return

    this.intentionalStop = true
    this.lifecycle = 'stopping'

    if (!this.proc) {
      this.resetServerState()
      return
    }

    this.proc.kill()
  }

  async request(
    method: string,
    params: Record<string, unknown> = {},
    options: RequestOptions = {}
  ): Promise<unknown> {
    if (!this.proc?.stdin?.writable) {
      throw new Error('Codex server is not running')
    }

    const id = ++this.requestId
    const timeoutMs = options.timeoutMs ?? this.getDefaultTimeoutMs(method)

    return new Promise((resolve, reject) => {
      const startedAt = Date.now()
      const timeoutId =
        timeoutMs > 0
          ? setTimeout(() => {
              const pending = this.pendingRequests.get(id)
              if (!pending) return

              this.pendingRequests.delete(id)
              const elapsedMs = Date.now() - pending.startedAt
              const error = new Error(
                `Codex request timed out after ${elapsedMs}ms (${pending.method})`
              )
              console.error('[codex] request timeout', {
                method: pending.method,
                requestId: id,
                elapsedMs
              })
              pending.reject(error)
            }, timeoutMs)
          : null

      this.pendingRequests.set(id, {
        method,
        startedAt,
        timeoutId,
        resolve,
        reject
      })

      const sent = this.send({ jsonrpc: '2.0', id, method, params })
      if (!sent) {
        if (timeoutId) clearTimeout(timeoutId)
        this.pendingRequests.delete(id)
        reject(new Error('Failed to send request to Codex server'))
      }
    })
  }

  notify(method: string, params: Record<string, unknown>): void {
    this.send({ jsonrpc: '2.0', method, params })
  }

  respond(id: number | string, result: Record<string, unknown>): void {
    this.send({ jsonrpc: '2.0', id, result })
  }

  async threadStart(params: Record<string, unknown>): Promise<unknown> {
    const requestedThreadId = this.getThreadId(params)
    const result = await this.request('thread/start', params)
    const actualThreadId = this.getThreadIdFromThreadStartResult(result)

    if (requestedThreadId && actualThreadId && requestedThreadId !== actualThreadId) {
      this.emitRendererEvent({
        method: 'thread/remapped',
        params: {
          fromThreadId: requestedThreadId,
          toThreadId: actualThreadId
        },
        source: 'appServer'
      })
    }

    return result
  }

  async turnStart(params: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.requestTurnStartWithCompatibility(params)
    } catch (error) {
      if (!this.matchesError(error, ['thread not found', 'invalid thread id'])) {
        throw error
      }

      const previousThreadId = this.getThreadId(params)
      const threadStartResult = await this.request('thread/start', {})
      const newThreadId = this.getThreadIdFromThreadStartResult(threadStartResult)

      if (!newThreadId) {
        throw error
      }

      if (previousThreadId && previousThreadId !== newThreadId) {
        this.emitRendererEvent({
          method: 'thread/remapped',
          params: {
            fromThreadId: previousThreadId,
            toThreadId: newThreadId
          },
          source: 'appServer'
        })
      }

      return this.requestTurnStartWithCompatibility({ ...params, threadId: newThreadId })
    }
  }

  private send(msg: JsonRpcMessage): boolean {
    if (!this.proc?.stdin?.writable) return false
    this.proc.stdin.write(JSON.stringify(msg) + '\n')
    return true
  }

  private emitRendererEvent(event: CodexEvent): void {
    void appendDebugEventLog(event)
    this.win?.webContents.send('codex:event', {
      ...event,
      source: event.source || 'appServer'
    })
  }

  private handleMessage(line: string): void {
    let msg: JsonRpcMessage
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }

    if (typeof msg.id === 'number' && this.pendingRequests.has(msg.id)) {
      const pending = this.pendingRequests.get(msg.id)!
      this.pendingRequests.delete(msg.id)
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId)
      }

      if (msg.error) {
        if (this.isAuthFailure(msg.error.message)) {
          this.emitAuthExpired(msg.error.message, {
            intentional: false,
            duringStartup: pending.method === 'initialize' || this.lifecycle === 'starting',
            recoverable: false
          })
        }
        pending.reject(new Error(msg.error.message))
      } else {
        pending.resolve(msg.result)
      }
      return
    }

    if (msg.method) {
      this.emitRendererEvent({
        method: msg.method,
        params: msg.params || {},
        requestId: msg.id,
        source: 'appServer'
      })
    }
  }

  private handleStderr(line: string): void {
    if (!line.trim()) return

    if (!this.isAuthFailure(line)) {
      return
    }

    const lowered = line.toLowerCase()
    if (lowered.includes('rmcp::transport::worker') || lowered.includes('mcp')) {
      return
    }

    this.emitAuthExpired(line, {
      intentional: false,
      duringStartup: this.lifecycle === 'starting',
      recoverable: false
    })
  }

  private resetServerState(): void {
    this.proc = null
    this.initPromise = null
    this.lifecycle = 'stopped'
    this.intentionalStop = false

    if (this.rl) {
      this.rl.close()
      this.rl = null
    }

    if (this.stderrRl) {
      this.stderrRl.close()
      this.stderrRl = null
    }
  }

  private terminateProcess(proc: ChildProcess): void {
    if (this.proc === proc) {
      this.proc = null
    }

    if (!proc.killed) {
      proc.kill()
    }
  }

  private failPendingRequests(reason: unknown): void {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    for (const [, pending] of this.pendingRequests) {
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId)
      }
      pending.reject(error)
    }
    this.pendingRequests.clear()
  }

  private getDefaultTimeoutMs(method: string): number {
    if (method === 'initialize') return STARTUP_TIMEOUT_MS
    if (method === 'thread/start' || method === 'turn/start' || method === 'turn/interrupt') {
      return CONTROL_TIMEOUT_MS
    }

    if (
      method === 'thread/read' ||
      method === 'thread/list' ||
      method.startsWith('model/') ||
      method.startsWith('config/') ||
      method.startsWith('skills/') ||
      method.startsWith('mcpServerStatus/')
    ) {
      return METADATA_TIMEOUT_MS
    }

    return CONTROL_TIMEOUT_MS
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Codex ${label} timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      promise
        .then((value) => {
          clearTimeout(timeoutId)
          resolve(value)
        })
        .catch((error) => {
          clearTimeout(timeoutId)
          reject(error)
        })
    })
  }

  private emitServerError(message: string, flags: ServerEventFlags): void {
    this.emitRendererEvent({
      method: 'server/error',
      params: {
        message,
        ...flags
      },
      source: 'appServer'
    })
  }

  private emitServerStopped(code: number | null, flags: ServerEventFlags): void {
    this.emitRendererEvent({
      method: 'server/stopped',
      params: {
        code,
        ...flags
      },
      source: 'appServer'
    })
  }

  private emitAuthExpired(message: string, flags: ServerEventFlags): void {
    const now = Date.now()
    if (message === this.lastAuthExpiredMessage && now - this.lastAuthExpiredAt < 2000) {
      return
    }

    this.lastAuthExpiredMessage = message
    this.lastAuthExpiredAt = now
    this.emitRendererEvent({
      method: 'auth/expired',
      params: {
        message,
        ...flags
      },
      source: 'appServer'
    })
  }

  private isAuthFailure(value: string): boolean {
    const text = value.toLowerCase()
    return (
      text.includes('tokenrefreshfailed') ||
      text.includes('invalid_grant') ||
      text.includes('refresh token is invalid') ||
      text.includes('authentication failed') ||
      text.includes('auth expired') ||
      text.includes('unauthorized') ||
      text.includes('invalid api key') ||
      text.includes('session expired')
    )
  }

  private getThreadId(params: Record<string, unknown>): string | null {
    const value = params.threadId
    return typeof value === 'string' && value ? value : null
  }

  private getThreadIdFromThreadStartResult(result: unknown): string | null {
    if (!isRecord(result)) return null
    const maybeThread = result.thread
    if (!isRecord(maybeThread)) return null
    const maybeId = maybeThread.id
    return typeof maybeId === 'string' && maybeId ? maybeId : null
  }

  private matchesError(error: unknown, needles: string[]): boolean {
    const message =
      error instanceof Error
        ? error.message.toLowerCase()
        : typeof error === 'string'
          ? error.toLowerCase()
          : ''
    return needles.some((needle) => message.includes(needle))
  }

  private async requestTurnStartWithCompatibility(
    params: Record<string, unknown>
  ): Promise<unknown> {
    const requestedMode =
      typeof params.collaborationMode === 'object' &&
      params.collaborationMode !== null &&
      typeof (params.collaborationMode as { mode?: unknown }).mode === 'string'
        ? (params.collaborationMode as { mode: string }).mode
        : null

    try {
      const result = await this.request('turn/start', params)
      if (requestedMode) {
        logPlanServer('turn/start accepted collaboration mode', {
          requestedMode,
          turnId:
            typeof result === 'object' && result !== null
              ? ((result as { turn?: { id?: unknown } }).turn?.id ?? null)
              : null
        })
      }
      return result
    } catch (error) {
      if (
        !('collaborationMode' in params) ||
        !this.matchesError(error, ['requires experimentalapi capability'])
      ) {
        throw error
      }

      const fallbackParams = { ...params }
      delete fallbackParams.collaborationMode
      logPlanServer('turn/start rejected collaboration mode, retrying without it', {
        requestedMode,
        error: error instanceof Error ? error.message : String(error)
      })
      const result = await this.request('turn/start', fallbackParams)
      return this.withTurnStartModeFallback(result, 'default')
    }
  }

  private withTurnStartModeFallback(
    result: unknown,
    collaborationModeKind: 'default' | 'plan'
  ): unknown {
    if (typeof result !== 'object' || result === null) {
      return result
    }

    const typedResult = result as TurnStartResultShape
    const nextResult: TurnStartResultShape = {
      ...typedResult,
      collaborationModeKind
    }

    if (typedResult.turn && typeof typedResult.turn === 'object') {
      nextResult.turn = {
        ...typedResult.turn,
        collaborationModeKind
      }
    }

    return nextResult
  }
}
