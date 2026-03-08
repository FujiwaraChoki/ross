import { app, shell, BrowserWindow, ipcMain, dialog, powerSaveBlocker, session } from 'electron'
import { basename, dirname, join, relative, sep } from 'path'
import { homedir } from 'os'
import { randomUUID } from 'crypto'
import { mkdir, writeFile, readFile, readdir, stat } from 'fs/promises'
import { spawn } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import ignore, { type Ignore } from 'ignore'
import { CodexServer } from './codex-server'
import { isAuthenticated, login } from './auth'
import { transcribeAudio } from './transcribe'

const codexServer = new CodexServer()
let keepAwakeBlockerId: number | null = null

type FileEditor = 'cursor' | 'zed' | 'vscode' | 'ghostty'

interface LinkedFileTarget {
  path: string
  line?: number
  column?: number
}

interface ProjectFileEntry {
  path: string
  name: string
  relativePath: string
  directory: string
}

const MAX_PROJECT_FILE_REFERENCES = 10000

function toPositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function parseLinkedFileTarget(rawHref: string): LinkedFileTarget {
  let href = decodeURIComponent(rawHref.trim())

  if (href.startsWith('file://')) {
    href = href.slice('file://'.length)
  }

  let line: number | undefined
  let column: number | undefined

  const hashMatch = href.match(/#L(\d+)(?:C(\d+))?$/i)
  if (hashMatch) {
    line = toPositiveInteger(hashMatch[1])
    column = toPositiveInteger(hashMatch[2]) || (line ? 1 : undefined)
    href = href.slice(0, hashMatch.index)
  }

  if (!line) {
    const colonMatch = href.match(/^(\/.+):(\d+)(?::(\d+))?$/)
    if (colonMatch) {
      href = colonMatch[1]
      line = toPositiveInteger(colonMatch[2])
      column = toPositiveInteger(colonMatch[3]) || (line ? 1 : undefined)
    }
  }

  return {
    path: href,
    line,
    column
  }
}

function runCommandCapture(
  command: string,
  args: string[],
  options?: { cwd?: string }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })

    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code ?? 'unknown'}`))
    })
  })
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore'
    })

    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

async function openPathInDefaultApp(path: string): Promise<void> {
  const errorMessage = await shell.openPath(path)
  if (errorMessage) {
    throw new Error(errorMessage)
  }
}

function isSafeBundledDocumentPath(relativePath: string): boolean {
  return (
    !relativePath.startsWith('/') &&
    !relativePath.includes('..') &&
    (relativePath.endsWith('.md') || relativePath.endsWith('.txt'))
  )
}

async function openBundledDocument(relativePath: string): Promise<void> {
  if (!isSafeBundledDocumentPath(relativePath)) {
    throw new Error('Invalid document path')
  }

  const bundledPath = join(app.getAppPath(), relativePath)
  const content = await readFile(bundledPath, 'utf8')
  const tempDir = join(app.getPath('temp'), 'ross-documents')
  const tempPath = join(tempDir, basename(relativePath))

  await mkdir(tempDir, { recursive: true })
  await writeFile(tempPath, content, 'utf8')
  await openPathInDefaultApp(tempPath)
}

function buildGotoTarget(path: string, line?: number, column?: number): string {
  if (!line) return path
  return `${path}:${line}:${column || 1}`
}

async function openFileInEditor(rawHref: string, editor: FileEditor): Promise<void> {
  const target = parseLinkedFileTarget(rawHref)

  switch (editor) {
    case 'cursor':
      try {
        await runCommand('cursor', [
          '--goto',
          buildGotoTarget(target.path, target.line, target.column)
        ])
        return
      } catch {
        await runCommand('open', ['-a', 'Cursor', target.path])
        return
      }
    case 'zed':
      try {
        await runCommand('zed', [buildGotoTarget(target.path, target.line, target.column)])
        return
      } catch {
        await runCommand('open', ['-a', 'Zed', target.path])
        return
      }
    case 'vscode':
      try {
        await runCommand('code', [
          '--goto',
          buildGotoTarget(target.path, target.line, target.column)
        ])
        return
      } catch {
        await runCommand('open', ['-a', 'Visual Studio Code', target.path])
        return
      }
    case 'ghostty':
      try {
        await runCommand('ghostty', [target.path])
        return
      } catch {
        await runCommand('open', ['-a', 'Ghostty', target.path])
        return
      }
  }
}

async function createIgnoreMatcher(rootPath: string): Promise<Ignore> {
  const matcher = ignore()
  matcher.add(['.git', '.git/**'])

  try {
    const gitignore = await readFile(join(rootPath, '.gitignore'), 'utf8')
    matcher.add(gitignore)
  } catch {
    // No .gitignore in this workspace root; keep the default matcher.
  }

  return matcher
}

async function listProjectFiles(rootPath: string): Promise<{
  files: ProjectFileEntry[]
  truncated: boolean
}> {
  const files: ProjectFileEntry[] = []
  const queue = [rootPath]
  let truncated = false
  const matcher = await createIgnoreMatcher(rootPath)

  while (queue.length > 0) {
    const currentDir = queue.shift()
    if (!currentDir) break

    let entries
    try {
      entries = await readdir(currentDir, { withFileTypes: true })
    } catch {
      continue
    }

    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      const relativePath = relative(rootPath, fullPath).split(sep).join('/')

      if (entry.isSymbolicLink()) continue
      if (matcher.ignores(relativePath)) continue

      if (entry.isDirectory()) {
        queue.push(fullPath)
        continue
      }

      if (!entry.isFile()) continue

      const slashIndex = relativePath.lastIndexOf('/')

      files.push({
        path: fullPath,
        name: entry.name,
        relativePath,
        directory: slashIndex >= 0 ? relativePath.slice(0, slashIndex) : '.'
      })

      if (files.length >= MAX_PROJECT_FILE_REFERENCES) {
        truncated = true
        break
      }
    }

    if (truncated) break
  }

  files.sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
      a.directory.localeCompare(b.directory, undefined, { sensitivity: 'base' })
  )

  return { files, truncated }
}

async function resolveProjectRootPath(projectPath: unknown): Promise<string> {
  const rawPath = typeof projectPath === 'string' ? projectPath.trim() : ''
  const candidates = rawPath ? [rawPath, dirname(rawPath)] : []

  for (const candidate of candidates) {
    try {
      const info = await stat(candidate)
      if (info.isDirectory()) return candidate
      if (info.isFile()) return dirname(candidate)
    } catch {
      continue
    }
  }

  return process.cwd()
}

function createWindow(): BrowserWindow {
  const vibrancySupported = process.platform === 'darwin'
  const titleBarHeight = 44

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 16 } }
      : {
          titleBarOverlay: {
            color: '#00000000',
            symbolColor: '#808080',
            height: titleBarHeight
          }
        }),
    ...(vibrancySupported
      ? { vibrancy: 'under-window', visualEffectState: 'active' }
      : { backgroundColor: '#181818' }),
    icon: join(__dirname, '../../resources/icon.png'),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  if (process.platform === 'darwin') {
    win.setWindowButtonVisibility(true)
  }

  win.webContents.setWindowOpenHandler((details) => {
    try {
      const url = new URL(details.url)
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        shell.openExternal(details.url)
      }
    } catch {
      // Ignore malformed URLs and keep them inside the app sandbox.
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.samihindi.ross')

  // Grant local-fonts permission so queryLocalFonts() works in the renderer
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = [
      'local-fonts',
      'clipboard-read',
      'clipboard-sanitized-write',
      'media',
      'notifications'
    ]
    callback(allowed.includes(permission))
  })

  // Set dock icon and name for dev mode (macOS)
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(join(__dirname, '../../resources/icon.png'))
  }
  app.setName('Ross')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const win = createWindow()
  codexServer.setWindow(win)

  // IPC handlers
  ipcMain.handle('codex:is-authenticated', () => isAuthenticated())
  ipcMain.handle('codex:login', () => login())

  ipcMain.handle('codex:start-server', async () => {
    await codexServer.start()
    return true
  })

  ipcMain.handle('codex:stop-server', () => {
    codexServer.stop()
    return true
  })

  ipcMain.handle('codex:thread-start', (_, params) => codexServer.threadStart(params))

  ipcMain.handle('codex:thread-read', (_, params) =>
    codexServer.request('thread/read', params || {})
  )

  ipcMain.handle('codex:thread-list', (_, params) =>
    codexServer.request('thread/list', params || {})
  )

  ipcMain.handle('codex:turn-start', (_, params) => codexServer.turnStart(params))

  ipcMain.handle('codex:turn-interrupt', (_, params) =>
    codexServer.request('turn/interrupt', params || {})
  )

  ipcMain.handle('codex:config-value-write', (_, params) =>
    codexServer.request('config/value/write', params || {})
  )

  ipcMain.handle('codex:config-read', (_, params) =>
    codexServer.request('config/read', params || { includeLayers: false })
  )

  ipcMain.handle('codex:config-batch-write', (_, params) =>
    codexServer.request('config/batchWrite', params || {})
  )

  ipcMain.handle('codex:model-list', () => codexServer.request('model/list', {}))

  ipcMain.handle('codex:mcp-server-reload', () =>
    codexServer.request('config/mcpServer/reload', {})
  )

  ipcMain.handle('codex:mcp-server-status-list', (_, params) =>
    codexServer.request('mcpServerStatus/list', params || {})
  )

  ipcMain.handle('codex:skills-list', (_, params) => {
    const requestParams =
      params && typeof params === 'object' ? { ...(params as Record<string, unknown>) } : {}

    const hasCwds =
      Array.isArray(requestParams.cwds) &&
      requestParams.cwds.every((cwd) => typeof cwd === 'string')

    if (!hasCwds) {
      requestParams.cwds = [process.cwd()]
    }

    return codexServer.request('skills/list', requestParams)
  })

  ipcMain.handle('codex:skills-config-write', (_, params) =>
    codexServer.request('skills/config/write', params || {})
  )

  ipcMain.handle('codex:open-project', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Open Project'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const fullPath = result.filePaths[0]
    const name = fullPath.split('/').pop() || fullPath
    return { path: fullPath, name }
  })

  ipcMain.handle('codex:list-project-files', async (_, projectPath: string) => {
    const rootPath = await resolveProjectRootPath(projectPath)
    return listProjectFiles(rootPath)
  })

  ipcMain.handle('codex:open-config-file', async () => {
    const configPath = join(homedir(), '.codex', 'config.toml')
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, '', { flag: 'a' })
    await openPathInDefaultApp(configPath)
  })

  ipcMain.handle('codex:open-attachments', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Attach Files',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Supported Files',
          extensions: [
            'png',
            'jpg',
            'jpeg',
            'gif',
            'webp',
            'bmp',
            'svg',
            'heic',
            'heif',
            'tif',
            'tiff',
            'pdf',
            'txt',
            'md',
            'markdown',
            'csv',
            'json',
            'doc',
            'docx',
            'xls',
            'xlsx',
            'ppt',
            'pptx',
            'rtf',
            'odt'
          ]
        },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) return null

    return result.filePaths.map((path) => ({
      path,
      name: basename(path)
    }))
  })

  ipcMain.handle('codex:open-path', async (_, path: string) => {
    if (typeof path !== 'string' || !path.startsWith('/')) {
      throw new Error('Invalid path')
    }

    await openPathInDefaultApp(path)
  })

  ipcMain.handle('codex:open-bundled-document', async (_, relativePath: string) => {
    if (typeof relativePath !== 'string') {
      throw new Error('Invalid document path')
    }

    await openBundledDocument(relativePath)
  })

  ipcMain.handle(
    'codex:stage-attachment',
    async (_, params: { name?: string; mimeType?: string; data: ArrayBuffer }) => {
      if (!(params?.data instanceof ArrayBuffer)) {
        throw new Error('Invalid attachment payload')
      }

      const inputName = typeof params?.name === 'string' ? params.name : 'attachment'
      const mimeType = typeof params?.mimeType === 'string' ? params.mimeType : ''
      const extFromName = inputName.includes('.') ? inputName.slice(inputName.lastIndexOf('.')) : ''
      const fallbackExt =
        mimeType === 'image/png'
          ? '.png'
          : mimeType === 'image/jpeg'
            ? '.jpg'
            : mimeType === 'image/webp'
              ? '.webp'
              : mimeType === 'image/gif'
                ? '.gif'
                : ''
      const ext = extFromName || fallbackExt
      const safeBase = inputName
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
      const fileName = `${safeBase || 'attachment'}-${randomUUID()}${ext}`
      const targetDir = join(app.getPath('userData'), 'attachments')
      const targetPath = join(targetDir, fileName)

      await mkdir(targetDir, { recursive: true })
      await writeFile(targetPath, Buffer.from(params.data))

      return {
        path: targetPath,
        name: inputName
      }
    }
  )

  ipcMain.handle(
    'codex:open-file-link',
    async (_, params: { href?: string; editor?: FileEditor }) => {
      const href = typeof params?.href === 'string' ? params.href : ''
      const editor = params?.editor

      if (!href.startsWith('/') && !href.startsWith('file://')) {
        throw new Error('Invalid file link')
      }

      if (editor !== 'cursor' && editor !== 'zed' && editor !== 'vscode' && editor !== 'ghostty') {
        throw new Error('Invalid editor')
      }

      await openFileInEditor(href, editor)
    }
  )

  ipcMain.handle('codex:reveal-in-finder', (_, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle('codex:transcribe', async (_, audioData: ArrayBuffer) => {
    return transcribeAudio(audioData)
  })

  ipcMain.handle('codex:set-keep-awake', (_, enabled: boolean) => {
    if (enabled) {
      if (keepAwakeBlockerId == null || !powerSaveBlocker.isStarted(keepAwakeBlockerId)) {
        keepAwakeBlockerId = powerSaveBlocker.start('prevent-app-suspension')
      }
      return
    }

    if (keepAwakeBlockerId != null && powerSaveBlocker.isStarted(keepAwakeBlockerId)) {
      powerSaveBlocker.stop(keepAwakeBlockerId)
    }
    keepAwakeBlockerId = null
  })

  ipcMain.handle('codex:set-window-opaque', (_, enabled: boolean) => {
    if (process.platform !== 'darwin') return

    if (enabled) {
      win.setVibrancy(null)
      win.setBackgroundColor('#181818')
      return
    }

    win.setBackgroundColor('#00000000')
    win.setVibrancy('under-window')
  })

  ipcMain.handle('codex:get-custom-instructions', async () => {
    const configPath = join(homedir(), '.codex', 'config.toml')
    try {
      const content = await readFile(configPath, 'utf-8')
      const match = content.match(
        /\[history\]\s*\n(?:[^\n]*\n)*?instructions\s*=\s*"""([\s\S]*?)"""/
      )
      if (match) return match[1].trim()
      const singleMatch = content.match(
        /\[history\]\s*\n(?:[^\n]*\n)*?instructions\s*=\s*"([^"]*)"/
      )
      if (singleMatch) return singleMatch[1]
      return ''
    } catch {
      return ''
    }
  })

  ipcMain.handle('codex:set-custom-instructions', async (_, instructions: string) => {
    const configDir = join(homedir(), '.codex')
    const configPath = join(configDir, 'config.toml')
    await mkdir(configDir, { recursive: true })

    let content = ''
    try {
      content = await readFile(configPath, 'utf-8')
    } catch {
      // File doesn't exist yet
    }

    const historyBlock = instructions.trim()
      ? `[history]\ninstructions = """\n${instructions.trim()}\n"""`
      : ''

    // Replace existing [history] section or append
    const historyRegex = /\[history\]\s*\n(?:(?!\n\[)[^\n]*\n?)*/
    if (historyRegex.test(content)) {
      content = content.replace(historyRegex, historyBlock ? historyBlock + '\n' : '')
    } else if (historyBlock) {
      content = content.trimEnd() + (content.trim() ? '\n\n' : '') + historyBlock + '\n'
    }

    await writeFile(configPath, content, 'utf-8')
    return true
  })

  // ── Git helpers ──────────────────────────────────────────────────────────

  ipcMain.handle(
    'codex:git-status',
    async (
      _,
      params: { cwd?: string }
    ): Promise<{
      branch: string
      filesChanged: number
      additions: number
      deletions: number
    }> => {
      const cwd = params?.cwd || process.cwd()

      const branch = (
        await runCommandCapture('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
      ).trim()

      // Combine staged + unstaged stats
      let filesChanged = 0
      let additions = 0
      let deletions = 0

      try {
        const numstat = await runCommandCapture('git', ['diff', 'HEAD', '--numstat'], { cwd })
        for (const line of numstat.trim().split('\n')) {
          if (!line) continue
          const [add, del] = line.split('\t')
          filesChanged++
          if (add !== '-') additions += parseInt(add, 10) || 0
          if (del !== '-') deletions += parseInt(del, 10) || 0
        }
      } catch {
        // No HEAD yet (initial commit) — diff against empty tree
        try {
          const numstat = await runCommandCapture('git', ['diff', '--cached', '--numstat'], { cwd })
          for (const line of numstat.trim().split('\n')) {
            if (!line) continue
            const [add, del] = line.split('\t')
            filesChanged++
            if (add !== '-') additions += parseInt(add, 10) || 0
            if (del !== '-') deletions += parseInt(del, 10) || 0
          }
        } catch {
          // ignore
        }

        // Also count untracked files
        try {
          const untracked = await runCommandCapture(
            'git',
            ['ls-files', '--others', '--exclude-standard'],
            { cwd }
          )
          for (const line of untracked.trim().split('\n')) {
            if (line) filesChanged++
          }
        } catch {
          // ignore
        }
      }

      return { branch, filesChanged, additions, deletions }
    }
  )

  ipcMain.handle(
    'codex:git-commit',
    async (
      _,
      params: {
        message: string
        includeUnstaged: boolean
        push: boolean
        createPr: boolean
        cwd?: string
      }
    ): Promise<{ success: boolean; error?: string }> => {
      const cwd = params?.cwd || process.cwd()

      try {
        if (params.includeUnstaged) {
          await runCommandCapture('git', ['add', '-A'], { cwd })
        }

        const commitArgs = ['commit']
        if (params.message.trim()) {
          commitArgs.push('-m', params.message.trim())
        } else {
          // Auto-generate message
          commitArgs.push('-m', 'Update changes')
        }

        await runCommandCapture('git', commitArgs, { cwd })

        if (params.push || params.createPr) {
          await runCommandCapture('git', ['push'], { cwd })
        }

        if (params.createPr) {
          try {
            await runCommandCapture('gh', ['pr', 'create', '--fill'], { cwd })
          } catch (prError) {
            return {
              success: true,
              error: `Committed & pushed, but PR creation failed: ${(prError as Error).message}`
            }
          }
        }

        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('codex:approve-command', (_, params) =>
    codexServer.notify('command/approve', params)
  )

  ipcMain.handle('codex:reject-command', (_, params) =>
    codexServer.notify('command/reject', params)
  )

  ipcMain.handle(
    'codex:resolve-server-request',
    (_, params: { requestId: number | string; result: Record<string, unknown> }) => {
      codexServer.respond(params.requestId, params.result)
    }
  )

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWin = createWindow()
      codexServer.setWindow(newWin)
    }
  })
})

app.on('window-all-closed', () => {
  if (keepAwakeBlockerId != null && powerSaveBlocker.isStarted(keepAwakeBlockerId)) {
    powerSaveBlocker.stop(keepAwakeBlockerId)
    keepAwakeBlockerId = null
  }
  codexServer.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (keepAwakeBlockerId != null && powerSaveBlocker.isStarted(keepAwakeBlockerId)) {
    powerSaveBlocker.stop(keepAwakeBlockerId)
    keepAwakeBlockerId = null
  }
  codexServer.stop()
})
