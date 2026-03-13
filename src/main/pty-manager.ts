import * as pty from 'node-pty'
import { existsSync } from 'fs'
import { platform, homedir } from 'os'
import type { BrowserWindow } from 'electron'

interface PtySession {
  id: string
  process: pty.IPty
}

const GHOSTTY_TERMINFO_DIRS = [
  '/Applications/Ghostty.app/Contents/Resources/terminfo',
  `${homedir()}/Applications/Ghostty.app/Contents/Resources/terminfo`
]

const GHOSTTY_RESOURCE_DIRS = [
  '/Applications/Ghostty.app/Contents/Resources/ghostty',
  `${homedir()}/Applications/Ghostty.app/Contents/Resources/ghostty`
]

function resolveGhosttyTerminfoDir(): string | null {
  for (const dir of GHOSTTY_TERMINFO_DIRS) {
    if (existsSync(`${dir}/78/xterm-ghostty`)) {
      return dir
    }
  }

  return null
}

function resolveGhosttyResourcesDir(): string | null {
  for (const dir of GHOSTTY_RESOURCE_DIRS) {
    if (existsSync(dir)) {
      return dir
    }
  }

  return null
}

export class PtyManager {
  private sessions = new Map<string, PtySession>()
  private window: BrowserWindow | null = null
  private nextId = 0

  setWindow(win: BrowserWindow): void {
    this.window = win
  }

  create(cwd?: string, cols = 80, rows = 24): string {
    const id = `pty-${++this.nextId}`
    const shell = platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/zsh'
    const args = platform() === 'win32' ? [] : ['--login']
    const safeCols = Number.isFinite(cols) ? Math.max(20, Math.floor(cols)) : 80
    const safeRows = Number.isFinite(rows) ? Math.max(5, Math.floor(rows)) : 24
    const ghosttyTerminfoDir = platform() === 'win32' ? null : resolveGhosttyTerminfoDir()
    const ghosttyResourcesDir = platform() === 'win32' ? null : resolveGhosttyResourcesDir()
    const terminalName = ghosttyTerminfoDir ? 'xterm-ghostty' : 'xterm-256color'

    // Filter out undefined env values that node-pty rejects
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value
    }
    env.COLORTERM = 'truecolor'
    env.TERM_PROGRAM = 'ghostty'
    env.TERM = terminalName
    if (ghosttyTerminfoDir) {
      env.TERMINFO = ghosttyTerminfoDir
      env.TERMINFO_DIRS = ghosttyTerminfoDir
    }
    if (ghosttyResourcesDir) {
      env.GHOSTTY_RESOURCES_DIR = ghosttyResourcesDir
    }

    const proc = pty.spawn(shell, args, {
      name: terminalName,
      cols: safeCols,
      rows: safeRows,
      cwd: cwd || homedir(),
      env
    })

    proc.onData((data) => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('codex:terminal-data', { id, data })
      }
    })

    proc.onExit(({ exitCode }) => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('codex:terminal-exit', { id, exitCode })
      }
      this.sessions.delete(id)
    })

    this.sessions.set(id, { id, process: proc })
    return id
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.process.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.process.resize(cols, rows)
  }

  destroy(id: string): void {
    const session = this.sessions.get(id)
    if (session) {
      session.process.kill()
      this.sessions.delete(id)
    }
  }

  destroyAll(): void {
    for (const [id] of this.sessions) {
      this.destroy(id)
    }
  }
}
