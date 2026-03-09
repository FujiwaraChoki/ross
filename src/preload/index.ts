import { contextBridge, ipcRenderer } from 'electron'

export type CodexEvent = {
  method: string
  params: Record<string, unknown>
  requestId?: number | string
}

export type CodexApprovalPolicy = 'untrusted' | 'on-failure' | 'on-request' | 'never'
export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

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
  openPath: (path: string): Promise<void> => ipcRenderer.invoke('codex:open-path', path),
  openBundledDocument: (relativePath: string): Promise<void> =>
    ipcRenderer.invoke('codex:open-bundled-document', relativePath),
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
  onEvent: (callback: (data: CodexEvent) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: CodexEvent): void => callback(data)
    ipcRenderer.on('codex:event', handler)
    return () => ipcRenderer.removeListener('codex:event', handler)
  }
}

contextBridge.exposeInMainWorld('codex', codexApi)

export type CodexApi = typeof codexApi
