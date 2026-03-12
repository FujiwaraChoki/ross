import { fixPath } from './fix-path'

// Must run before any child process is spawned so `codex`, `git`, etc. are on PATH
// when the app is launched from Finder (macOS GUI apps get a minimal PATH).
fixPath()

import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  globalShortcut,
  powerSaveBlocker,
  session,
  Menu
} from 'electron'
import { basename, dirname, extname, join, relative, resolve, sep } from 'path'
import { homedir } from 'os'
import { randomUUID } from 'crypto'
import { appendFile, mkdir, writeFile, readFile, readdir, stat, rm } from 'fs/promises'
import { spawn } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import ignore, { type Ignore } from 'ignore'
import { CodexServer } from './codex-server'
import { isAuthenticated, login } from './auth'
import { transcribeAudio } from './transcribe'
import { deleteTheme, importTheme, listThemeCatalog } from './theme-library'
import { coerceCodexEvent } from '../shared/codex-events'

const codexServer = new CodexServer()
let keepAwakeBlockerId: number | null = null
let registeredFontShortcutWindowId: number | null = null

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

const FONT_SIZE_SHORTCUTS = {
  increase: ['CommandOrControl+=', 'CommandOrControl+Shift+=', 'CommandOrControl+numadd'],
  decrease: ['CommandOrControl+-', 'CommandOrControl+numsub'],
  reset: ['CommandOrControl+0']
} as const

function unregisterFontSizeShortcuts(): void {
  for (const accelerator of [
    ...FONT_SIZE_SHORTCUTS.increase,
    ...FONT_SIZE_SHORTCUTS.decrease,
    ...FONT_SIZE_SHORTCUTS.reset
  ]) {
    if (globalShortcut.isRegistered(accelerator)) {
      globalShortcut.unregister(accelerator)
    }
  }
  registeredFontShortcutWindowId = null
}

function registerFontSizeShortcuts(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  if (registeredFontShortcutWindowId === win.id) return

  unregisterFontSizeShortcuts()

  const sendFontSizeShortcut = (delta: number): void => {
    if (win.isDestroyed() || !win.isFocused()) return
    win.webContents.send('codex:font-size-shortcut', { delta })
  }

  for (const accelerator of FONT_SIZE_SHORTCUTS.increase) {
    globalShortcut.register(accelerator, () => sendFontSizeShortcut(1))
  }
  for (const accelerator of FONT_SIZE_SHORTCUTS.decrease) {
    globalShortcut.register(accelerator, () => sendFontSizeShortcut(-1))
  }
  for (const accelerator of FONT_SIZE_SHORTCUTS.reset) {
    globalShortcut.register(accelerator, () => sendFontSizeShortcut(0))
  }

  registeredFontShortcutWindowId = win.id
}

interface CodexConfigLayer {
  name?: {
    type?: string | null
    file?: string | null
  } | null
  version?: string | null
}

interface CodexConfigReadResult {
  config?: {
    skills?: Record<string, unknown> | null
  } | null
  layers?: CodexConfigLayer[] | null
}

interface SkillsConfigWriteParams {
  path: string
  enabled: boolean
}

interface SkillsConfigEntry {
  path: string
  enabled: boolean
}

interface StoredPlanSummary {
  path: string
  name: string
  title: string
  preview: string
  updatedAt: number
  size: number
}

interface StoredPlanDocument extends StoredPlanSummary {
  content: string
}

interface SavePlanDocumentParams {
  title?: string
  content: string
}

const MAX_PROJECT_FILE_REFERENCES = 10000
const PROJECT_ICON_CANDIDATES = [
  'favicon.ico',
  'favicon.png',
  'favicon.svg',
  'icon.png',
  'icon.svg',
  'public/favicon.ico',
  'public/favicon.png',
  'public/favicon.svg',
  'public/icon.png',
  'public/icon.svg',
  'src/app/favicon.ico',
  'src/app/favicon.png',
  'src/app/favicon.svg',
  'src/app/icon.png',
  'src/app/icon.svg',
  'app/favicon.ico',
  'app/favicon.png',
  'app/favicon.svg',
  'app/icon.png',
  'app/icon.svg',
  'src/favicon.ico',
  'src/favicon.png',
  'src/favicon.svg',
  'src/icon.png',
  'src/icon.svg'
] as const
const PROJECT_ICON_MIME_TYPES: Record<string, string> = {
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
}
const ROSS_PLANS_DIR = join(homedir(), '.ross', 'plans')
const APP_STATE_FILENAME = 'app-state.json'
const DEBUG_EVENT_LOG_FILENAME = 'codex-events.ndjson'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

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

function getAppStatePath(): string {
  return join(app.getPath('userData'), APP_STATE_FILENAME)
}

function getDebugEventLogPath(): string {
  return join(app.getPath('userData'), DEBUG_EVENT_LOG_FILENAME)
}

async function appendDebugEventLog(event: {
  method: string
  params: Record<string, unknown>
  requestId?: number | string
  source?: string
}): Promise<void> {
  try {
    const filePath = getDebugEventLogPath()
    await mkdir(dirname(filePath), { recursive: true })
    await appendFile(
      filePath,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        source: event.source || 'hostBridge',
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

async function loadStoredAppState(): Promise<unknown | null> {
  try {
    const rawState = await readFile(getAppStatePath(), 'utf8')
    return JSON.parse(rawState) as unknown
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return null
    }

    console.error('Failed to load stored app state:', error)
    return null
  }
}

async function saveStoredAppState(state: unknown): Promise<boolean> {
  try {
    const filePath = getAppStatePath()
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    return true
  } catch (error) {
    console.error('Failed to save app state:', error)
    return false
  }
}

async function clearStoredAppState(): Promise<boolean> {
  try {
    await rm(getAppStatePath(), { force: true })
    return true
  } catch (error) {
    console.error('Failed to clear app state:', error)
    return false
  }
}

async function ensurePlansDirectory(): Promise<string> {
  await mkdir(ROSS_PLANS_DIR, { recursive: true })
  return ROSS_PLANS_DIR
}

function resolvePlanPath(planPath: string): string {
  const resolvedPath = resolve(planPath)
  const relativePath = relative(resolve(ROSS_PLANS_DIR), resolvedPath)

  if (
    relativePath === '' ||
    relativePath.startsWith('..') ||
    relativePath.split(sep).includes('..') ||
    extname(resolvedPath).toLowerCase() !== '.md'
  ) {
    throw new Error('Invalid plan path')
  }

  return resolvedPath
}

function slugifyPlanTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function formatPlanFilenameDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  const seconds = `${date.getSeconds()}`.padStart(2, '0')

  return `${year}${month}${day}-${hours}${minutes}${seconds}`
}

function getPlanTitleFromMarkdown(markdown: string, fallbackName: string): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  const candidate = match?.[1]?.trim()

  if (candidate) return candidate
  return fallbackName.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim() || 'Untitled plan'
}

function getPlanPreview(markdown: string): string {
  return markdown
    .replace(/^---[\s\S]*?---\s*/m, '')
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .filter((line) => line.length > 0)
    .slice(1)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 180)
}

async function readStoredPlanDocument(planPath: string): Promise<StoredPlanDocument> {
  const resolvedPath = resolvePlanPath(planPath)
  const [content, stats] = await Promise.all([readFile(resolvedPath, 'utf8'), stat(resolvedPath)])
  const name = basename(resolvedPath)

  return {
    path: resolvedPath,
    name,
    title: getPlanTitleFromMarkdown(content, name),
    preview: getPlanPreview(content),
    updatedAt: stats.mtimeMs,
    size: stats.size,
    content
  }
}

async function listStoredPlans(): Promise<{ directory: string; plans: StoredPlanSummary[] }> {
  const directory = await ensurePlansDirectory()
  const entries = await readdir(directory, { withFileTypes: true })
  const plans = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.md')
      .map(async (entry) => {
        try {
          const document = await readStoredPlanDocument(join(directory, entry.name))
          return {
            path: document.path,
            name: document.name,
            title: document.title,
            preview: document.preview,
            updatedAt: document.updatedAt,
            size: document.size
          }
        } catch (error) {
          console.error(`Failed to read plan document ${entry.name}:`, error)
          return null
        }
      })
  )

  return {
    directory,
    plans: plans
      .filter((plan): plan is StoredPlanSummary => Boolean(plan))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

async function saveStoredPlanDocument(params: SavePlanDocumentParams): Promise<StoredPlanDocument> {
  const content = typeof params.content === 'string' ? params.content.trim() : ''
  if (!content) {
    throw new Error('Plan content is required')
  }

  const directory = await ensurePlansDirectory()
  const title =
    typeof params.title === 'string' && params.title.trim() ? params.title.trim() : 'Plan'
  const slug = slugifyPlanTitle(title) || 'plan'
  const filename = `${formatPlanFilenameDate()}-${slug}-${randomUUID().slice(0, 8)}.md`
  const filePath = join(directory, filename)

  await writeFile(filePath, `${content}\n`, 'utf8')
  console.log('[plan][storage] Saved plan document', {
    title,
    filePath,
    bytes: Buffer.byteLength(`${content}\n`, 'utf8')
  })
  return readStoredPlanDocument(filePath)
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

async function resolveProjectIcon(projectPath: unknown): Promise<string | null> {
  const rootPath = await resolveProjectRootPath(projectPath)

  for (const candidate of PROJECT_ICON_CANDIDATES) {
    const iconPath = join(rootPath, candidate)

    try {
      const info = await stat(iconPath)
      if (!info.isFile()) continue

      const mimeType = PROJECT_ICON_MIME_TYPES[extname(iconPath).toLowerCase()]
      if (!mimeType) continue

      const file = await readFile(iconPath)
      return `data:${mimeType};base64,${file.toString('base64')}`
    } catch {
      continue
    }
  }

  return null
}

function normalizeSkillsConfigEntries(value: unknown): SkillsConfigEntry[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!isRecord(entry)) return []
    const path = entry.path
    const enabled = entry.enabled
    if (typeof path !== 'string' || typeof enabled !== 'boolean') return []
    return [{ path, enabled }]
  })
}

function getConfigWriteTarget(result: CodexConfigReadResult): {
  filePath: string | null
  version: string | null
} {
  for (const layer of result.layers || []) {
    if (layer?.name?.type === 'user' && typeof layer.name.file === 'string') {
      return {
        filePath: layer.name.file,
        version: typeof layer.version === 'string' ? layer.version : null
      }
    }
  }

  return { filePath: null, version: null }
}

function shouldFallbackSkillsConfigWrite(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === 'string'
        ? error.toLowerCase()
        : ''

  return (
    (message.includes('skills/config/write') && message.includes('unknown variant')) ||
    message.includes('method not found') ||
    message.includes('unknown method')
  )
}

async function writeSkillsConfigFallback(params: SkillsConfigWriteParams): Promise<unknown> {
  const configReadResult = (await codexServer.request('config/read', {
    includeLayers: true
  })) as CodexConfigReadResult

  const skillsConfig = isRecord(configReadResult?.config?.skills)
    ? configReadResult.config.skills
    : null
  const nextEntries = normalizeSkillsConfigEntries(skillsConfig?.config).filter(
    (entry) => entry.path !== params.path
  )

  if (!params.enabled) {
    nextEntries.push({ path: params.path, enabled: false })
  }

  const hasOtherSkillsSettings = Object.entries(skillsConfig || {}).some(
    ([key, value]) => key !== 'config' && value !== null && value !== undefined
  )

  const edits =
    nextEntries.length > 0 || hasOtherSkillsSettings
      ? [
          {
            keyPath: 'skills.config',
            value: nextEntries,
            mergeStrategy: 'replace' as const
          }
        ]
      : [
          {
            keyPath: 'skills',
            value: null,
            mergeStrategy: 'replace' as const
          }
        ]

  const target = getConfigWriteTarget(configReadResult)
  const writeResult = await codexServer.request('config/batchWrite', {
    edits,
    filePath: target.filePath,
    expectedVersion: target.version
  })

  return {
    ...(isRecord(writeResult) ? writeResult : {}),
    effectiveEnabled: params.enabled
  }
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

function forwardCodexEventToWindow(win: BrowserWindow, rawEvent: unknown): boolean {
  const event = coerceCodexEvent(rawEvent, 'hostBridge')
  if (!event) return false

  if (is.dev) {
    void appendDebugEventLog(event)
  }

  win.webContents.send('codex:event', {
    ...event,
    source: event.source || 'hostBridge'
  })
  return true
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
  const sendFontSizeShortcut = (delta: number): void => {
    if (win.isDestroyed()) return
    win.webContents.send('codex:font-size-shortcut', { delta })
  }
  win.on('focus', () => registerFontSizeShortcuts(win))
  win.on('blur', () => {
    if (registeredFontShortcutWindowId === win.id) {
      unregisterFontSizeShortcuts()
    }
  })
  win.on('closed', () => {
    if (registeredFontShortcutWindowId === win.id) {
      unregisterFontSizeShortcuts()
    }
  })
  if (win.isFocused()) {
    registerFontSizeShortcuts(win)
  }

  // macOS application menu
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project',
          accelerator: 'CmdOrCtrl+O',
          click: async (): Promise<void> => {
            const result = await dialog.showOpenDialog(win, {
              properties: ['openDirectory'],
              title: 'Open Project'
            })
            if (result.canceled || result.filePaths.length === 0) return
            const fullPath = result.filePaths[0]
            const name = fullPath.split('/').pop() || fullPath
            win.webContents.send('codex:open-project-result', { path: fullPath, name })
          }
        },
        { type: 'separator' },
        ...(process.platform === 'darwin'
          ? [{ role: 'close' as const }]
          : [{ role: 'quit' as const }])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin'
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const }])
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Increase Font Size',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => sendFontSizeShortcut(1)
        },
        {
          label: 'Decrease Font Size',
          accelerator: 'CmdOrCtrl+-',
          click: () => sendFontSizeShortcut(-1)
        },
        {
          label: 'Reset Font Size',
          accelerator: 'CmdOrCtrl+0',
          click: () => sendFontSizeShortcut(0)
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

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

  ipcMain.handle('codex:skills-config-write', async (_, params) => {
    const path = isRecord(params) && typeof params.path === 'string' ? params.path : ''
    const enabled = isRecord(params) && typeof params.enabled === 'boolean' ? params.enabled : null

    if (!path || enabled === null) {
      throw new Error('Invalid skills config write request')
    }

    const requestParams = { path, enabled }

    try {
      return await codexServer.request('skills/config/write', requestParams)
    } catch (error) {
      if (!shouldFallbackSkillsConfigWrite(error)) {
        throw error
      }

      return writeSkillsConfigFallback(requestParams)
    }
  })

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

  ipcMain.handle('codex:get-project-icon', async (_, projectPath: string) =>
    resolveProjectIcon(projectPath)
  )

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

  ipcMain.handle('codex:list-themes', async () => listThemeCatalog())

  ipcMain.handle('codex:import-theme', async () => importTheme(win))

  ipcMain.handle('codex:delete-theme', async (_, themeId: string) => {
    if (typeof themeId !== 'string') {
      throw new Error('Invalid theme id')
    }

    return deleteTheme(themeId)
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

  ipcMain.handle('codex:load-app-state', async () => loadStoredAppState())

  ipcMain.handle('codex:save-app-state', async (_, state: unknown) => saveStoredAppState(state))

  ipcMain.handle('codex:clear-app-state', async () => clearStoredAppState())

  ipcMain.handle('codex:plans-list', async () => listStoredPlans())

  ipcMain.handle('codex:plan-read', async (_, planPath: string) => readStoredPlanDocument(planPath))

  ipcMain.handle('codex:plan-save', async (_, params) => {
    const request = isRecord(params) ? params : {}
    return saveStoredPlanDocument({
      title: typeof request.title === 'string' ? request.title : undefined,
      content: typeof request.content === 'string' ? request.content : ''
    })
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

  ipcMain.handle('codex:ingest-event', (_, event: unknown) => {
    return forwardCodexEventToWindow(win, event)
  })

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
  unregisterFontSizeShortcuts()
  if (keepAwakeBlockerId != null && powerSaveBlocker.isStarted(keepAwakeBlockerId)) {
    powerSaveBlocker.stop(keepAwakeBlockerId)
    keepAwakeBlockerId = null
  }
  codexServer.stop()
})
