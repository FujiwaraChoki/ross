import { spawn, type ChildProcess } from 'child_process'
import readline from 'readline'
import { BrowserWindow } from 'electron'

interface JsonRpcMessage {
  jsonrpc?: string
  id?: number | string
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface PendingRequest {
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

function logPlanServer(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.log('[plan][server]', message, details)
    return
  }

  console.log('[plan][server]', message)
}

export class CodexServer {
  private proc: ChildProcess | null = null
  private rl: readline.Interface | null = null
  private stderrRl: readline.Interface | null = null
  private requestId = 0
  private pendingRequests = new Map<number, PendingRequest>()
  private win: BrowserWindow | null = null
  private initPromise: Promise<void> | null = null

  setWindow(win: BrowserWindow): void {
    this.win = win
  }

  start(): Promise<void> {
    if (this.proc && this.initPromise) {
      return this.initPromise
    }

    this.proc = spawn('codex', ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.proc.on('error', (err) => {
      console.error('[codex] Failed to start codex app-server:', err)
      this.win?.webContents.send('codex:event', {
        method: 'server/error',
        params: { message: err.message }
      })
      this.failPendingRequests(err)
      this.resetServerState()
    })

    this.proc.on('close', (code) => {
      console.log('codex app-server exited with code', code)
      this.win?.webContents.send('codex:event', {
        method: 'server/stopped',
        params: { code }
      })
      this.failPendingRequests(new Error(`Codex server exited (code: ${code ?? 'unknown'})`))
      this.resetServerState()
    })

    this.rl = readline.createInterface({ input: this.proc.stdout! })
    this.rl.on('line', (line) => this.handleMessage(line))

    this.stderrRl = readline.createInterface({ input: this.proc.stderr! })
    this.stderrRl.on('line', (line) => this.handleStderr(line))

    // Initialize the connection
    this.initPromise = this.request('initialize', {
      clientInfo: { name: 'ross-desktop', title: 'Ross', version: '1.0.1' },
      capabilities: {
        experimentalApi: true
      }
    })
      .then((result) => {
        logPlanServer('Initialized app-server connection', {
          experimentalApi: true,
          result: typeof result === 'object' && result !== null ? result : null
        })
        return result
      })
      .then(() => this.notify('initialized', {}))
      .then(() => undefined)

    return this.initPromise
  }

  stop(): void {
    if (!this.proc && !this.rl && !this.stderrRl) return

    if (this.proc) {
      this.proc.kill()
    }

    this.failPendingRequests(new Error('Server stopped'))
    this.resetServerState()
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.proc?.stdin?.writable) {
      throw new Error('Codex server is not running')
    }

    const id = ++this.requestId
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      const sent = this.send({ jsonrpc: '2.0', id, method, params })
      if (!sent) {
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
      this.win?.webContents.send('codex:event', {
        method: 'thread/remapped',
        params: {
          fromThreadId: requestedThreadId,
          toThreadId: actualThreadId
        }
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
        this.win?.webContents.send('codex:event', {
          method: 'thread/remapped',
          params: {
            fromThreadId: previousThreadId,
            toThreadId: newThreadId
          }
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
      if (msg.error) {
        pending.reject(new Error(msg.error.message))
      } else {
        pending.resolve(msg.result)
      }
    } else if (msg.method) {
      // Forward notifications to renderer
      this.win?.webContents.send('codex:event', {
        method: msg.method,
        params: msg.params,
        requestId: msg.id
      })
    }
  }

  private handleStderr(line: string): void {
    if (!line.trim()) return

    const text = line.toLowerCase()
    if (
      text.includes('tokenrefreshfailed') ||
      text.includes('invalid_grant') ||
      text.includes('refresh token is invalid')
    ) {
      if (text.includes('rmcp::transport::worker') || text.includes('mcp')) {
        return
      }

      this.win?.webContents.send('codex:event', {
        method: 'auth/expired',
        params: { message: line }
      })
    }
  }

  private resetServerState(): void {
    this.proc = null
    this.initPromise = null

    if (this.rl) {
      this.rl.close()
      this.rl = null
    }

    if (this.stderrRl) {
      this.stderrRl.close()
      this.stderrRl = null
    }
  }

  private failPendingRequests(reason: unknown): void {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    for (const [, pending] of this.pendingRequests) {
      pending.reject(error)
    }
    this.pendingRequests.clear()
  }

  private getThreadId(params: Record<string, unknown>): string | null {
    const value = params.threadId
    return typeof value === 'string' && value ? value : null
  }

  private getThreadIdFromThreadStartResult(result: unknown): string | null {
    if (typeof result !== 'object' || result === null) return null
    const maybeThread = (result as { thread?: unknown }).thread
    if (typeof maybeThread !== 'object' || maybeThread === null) return null
    const maybeId = (maybeThread as { id?: unknown }).id
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
