import { contextBridge, ipcRenderer, webFrame } from 'electron'
import type { ThemeCatalogEntry } from '../shared/theme'
import type { CodexEvent } from '../shared/codex-events'

export type CodexApprovalPolicy = 'untrusted' | 'on-failure' | 'on-request' | 'never'
export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'
export type CodexCollaborationModeKind = 'default' | 'plan'

export interface CodexConfigReadResponse {
  config?: {
    approval_policy?: CodexApprovalPolicy | null
    sandbox_mode?: CodexSandboxMode | null
    mcp_servers?: Record<string, unknown> | null
  }
  layers?: Array<{
    name?: {
      type?: string | null
      file?: string | null
    } | null
    version?: string | null
  }> | null
}

export interface StoredPlanSummary {
  path: string
  name: string
  title: string
  preview: string
  updatedAt: number
  size: number
}

export interface StoredPlanDocument extends StoredPlanSummary {
  content: string
}

export interface ThemeCatalogResponse {
  themes: ThemeCatalogEntry[]
}

export interface GhosttyAppearance {
  fontFamily?: string
  fontSize?: number
  scrollbackLimit?: number
  windowPaddingX?: number
  windowPaddingY?: number
  background?: string
  foreground?: string
  cursor?: string
  cursorAccent?: string
  selectionBackground?: string
  selectionForeground?: string
  splitDividerColor?: string
  black?: string
  red?: string
  green?: string
  yellow?: string
  blue?: string
  magenta?: string
  cyan?: string
  white?: string
  brightBlack?: string
  brightRed?: string
  brightGreen?: string
  brightYellow?: string
  brightBlue?: string
  brightMagenta?: string
  brightCyan?: string
  brightWhite?: string
}

const codexApi = {
  isAuthenticated: (): Promise<boolean> => ipcRenderer.invoke('codex:is-authenticated'),
  login: (): Promise<void> => ipcRenderer.invoke('codex:login'),
  startServer: (): Promise<boolean> => ipcRenderer.invoke('codex:start-server'),
  stopServer: (): Promise<boolean> => ipcRenderer.invoke('codex:stop-server'),
  threadStart: (params: Record<string, unknown>): Promise<unknown> =>
    ipcRenderer.invoke('codex:thread-start', params),
  threadRead: (params: { threadId: string; includeTurns?: boolean }): Promise<unknown> =>
    ipcRenderer.invoke('codex:thread-read', params),
  threadList: (params?: Record<string, unknown>): Promise<unknown> =>
    ipcRenderer.invoke('codex:thread-list', params),
  turnStart: (params: Record<string, unknown>): Promise<unknown> =>
    ipcRenderer.invoke('codex:turn-start', params),
  turnInterrupt: (params: { threadId: string; turnId: string }): Promise<unknown> =>
    ipcRenderer.invoke('codex:turn-interrupt', params),
  configValueWrite: (params: {
    keyPath: string
    value: unknown
    mergeStrategy?: 'replace' | 'upsert'
    filePath?: string | null
    expectedVersion?: string | null
  }): Promise<unknown> => ipcRenderer.invoke('codex:config-value-write', params),
  configRead: (params?: {
    includeLayers?: boolean
    cwd?: string | null
  }): Promise<CodexConfigReadResponse> => ipcRenderer.invoke('codex:config-read', params),
  configBatchWrite: (params: {
    edits: {
      keyPath: string
      value: unknown
      mergeStrategy?: 'replace' | 'upsert'
    }[]
    filePath?: string | null
    expectedVersion?: string | null
  }): Promise<unknown> => ipcRenderer.invoke('codex:config-batch-write', params),
  modelList: (): Promise<unknown> => ipcRenderer.invoke('codex:model-list'),
  mcpServerReload: (): Promise<unknown> => ipcRenderer.invoke('codex:mcp-server-reload'),
  mcpServerStatusList: (params?: Record<string, unknown>): Promise<unknown> =>
    ipcRenderer.invoke('codex:mcp-server-status-list', params),
  skillsList: (params?: Record<string, unknown>): Promise<unknown> =>
    ipcRenderer.invoke('codex:skills-list', params),
  skillsConfigWrite: (params: { path: string; enabled: boolean }): Promise<unknown> =>
    ipcRenderer.invoke('codex:skills-config-write', params),
  openProject: (): Promise<{ path: string; name: string } | null> =>
    ipcRenderer.invoke('codex:open-project'),
  openConfigFile: (): Promise<void> => ipcRenderer.invoke('codex:open-config-file'),
  listProjectFiles: (
    projectPath: string
  ): Promise<{
    files: { path: string; name: string; relativePath: string; directory: string }[]
    truncated: boolean
  }> => ipcRenderer.invoke('codex:list-project-files', projectPath),
  getProjectIcon: (projectPath: string): Promise<string | null> =>
    ipcRenderer.invoke('codex:get-project-icon', projectPath),
  openAttachments: (): Promise<{ path: string; name: string }[] | null> =>
    ipcRenderer.invoke('codex:open-attachments'),
  listThemes: (): Promise<ThemeCatalogResponse> => ipcRenderer.invoke('codex:list-themes'),
  importTheme: (): Promise<{ imported: ThemeCatalogEntry; themes: ThemeCatalogEntry[] } | null> =>
    ipcRenderer.invoke('codex:import-theme'),
  deleteTheme: (themeId: string): Promise<ThemeCatalogResponse> =>
    ipcRenderer.invoke('codex:delete-theme', themeId),
  openPath: (path: string): Promise<void> => ipcRenderer.invoke('codex:open-path', path),
  openBundledDocument: (relativePath: string): Promise<void> =>
    ipcRenderer.invoke('codex:open-bundled-document', relativePath),
  loadAppState: (): Promise<unknown | null> => ipcRenderer.invoke('codex:load-app-state'),
  saveAppState: (state: unknown): Promise<boolean> =>
    ipcRenderer.invoke('codex:save-app-state', state),
  clearAppState: (): Promise<boolean> => ipcRenderer.invoke('codex:clear-app-state'),
  listPlans: (): Promise<{ directory: string; plans: StoredPlanSummary[] }> =>
    ipcRenderer.invoke('codex:plans-list'),
  readPlan: (path: string): Promise<StoredPlanDocument> =>
    ipcRenderer.invoke('codex:plan-read', path),
  savePlan: (params: { title?: string; content: string }): Promise<StoredPlanDocument> =>
    ipcRenderer.invoke('codex:plan-save', params),
  stageAttachment: (params: {
    name?: string
    mimeType?: string
    data: ArrayBuffer
  }): Promise<{ path: string; name: string }> =>
    ipcRenderer.invoke('codex:stage-attachment', params),
  openFileLink: (params: {
    href: string
    editor: 'cursor' | 'zed' | 'vscode' | 'ghostty'
  }): Promise<void> => ipcRenderer.invoke('codex:open-file-link', params),
  revealInFinder: (path: string): Promise<void> =>
    ipcRenderer.invoke('codex:reveal-in-finder', path),
  approveCommand: (params: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('codex:approve-command', params),
  rejectCommand: (params: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('codex:reject-command', params),
  resolveServerRequest: (params: {
    requestId: number | string
    result: Record<string, unknown>
  }): Promise<void> => ipcRenderer.invoke('codex:resolve-server-request', params),
  transcribe: (audioData: ArrayBuffer): Promise<string> =>
    ipcRenderer.invoke('codex:transcribe', audioData),
  setKeepAwake: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('codex:set-keep-awake', enabled),
  setOpaqueWindowBackground: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('codex:set-window-opaque', enabled),
  getCustomInstructions: (): Promise<string> => ipcRenderer.invoke('codex:get-custom-instructions'),
  setCustomInstructions: (instructions: string): Promise<boolean> =>
    ipcRenderer.invoke('codex:set-custom-instructions', instructions),
  gitStatus: (params?: {
    cwd?: string
  }): Promise<{
    branch: string
    filesChanged: number
    additions: number
    deletions: number
  }> => ipcRenderer.invoke('codex:git-status', params || {}),
  gitCommit: (params: {
    message: string
    includeUnstaged: boolean
    push: boolean
    createPr: boolean
    cwd?: string
  }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('codex:git-commit', params),
  ingestEvent: (event: CodexEvent): Promise<boolean> =>
    ipcRenderer.invoke('codex:ingest-event', event),
  onEvent: (callback: (data: CodexEvent) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: CodexEvent): void => callback(data)
    ipcRenderer.on('codex:event', handler)
    return () => ipcRenderer.removeListener('codex:event', handler)
  },
  onOpenProjectResult: (callback: (data: { path: string; name: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { path: string; name: string }): void =>
      callback(data)
    ipcRenderer.on('codex:open-project-result', handler)
    return () => ipcRenderer.removeListener('codex:open-project-result', handler)
  },
  onFontSizeShortcut: (callback: (data: { delta: number }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { delta: number }): void => callback(data)
    ipcRenderer.on('codex:font-size-shortcut', handler)
    return () => ipcRenderer.removeListener('codex:font-size-shortcut', handler)
  },
  setZoomFactor: (factor: number): void => {
    webFrame.setZoomFactor(factor)
  },

  // Terminal (PTY)
  readGhosttyAppearance: (): Promise<GhosttyAppearance | null> =>
    ipcRenderer.invoke('codex:ghostty-config-read'),
  terminalCreate: (params?: { cwd?: string; cols?: number; rows?: number }): Promise<string> =>
    ipcRenderer.invoke('codex:terminal-create', params),
  terminalWrite: (params: { id: string; data: string }): Promise<void> =>
    ipcRenderer.invoke('codex:terminal-write', params),
  terminalResize: (params: { id: string; cols: number; rows: number }): Promise<void> =>
    ipcRenderer.invoke('codex:terminal-resize', params),
  terminalDestroy: (params: { id: string }): Promise<void> =>
    ipcRenderer.invoke('codex:terminal-destroy', params),
  onTerminalData: (callback: (data: { id: string; data: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { id: string; data: string }): void =>
      callback(data)
    ipcRenderer.on('codex:terminal-data', handler)
    return () => ipcRenderer.removeListener('codex:terminal-data', handler)
  },
  onTerminalExit: (callback: (data: { id: string; exitCode: number }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { id: string; exitCode: number }): void =>
      callback(data)
    ipcRenderer.on('codex:terminal-exit', handler)
    return () => ipcRenderer.removeListener('codex:terminal-exit', handler)
  }
}

contextBridge.exposeInMainWorld('codex', codexApi)

export type CodexApi = typeof codexApi
