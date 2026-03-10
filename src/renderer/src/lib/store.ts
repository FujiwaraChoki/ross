import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME_ID,
  type ThemeCatalogEntry,
  type ThemePreference
} from '../../../shared/theme'

export interface MessageItem {
  id: string
  type:
    | 'agentMessage'
    | 'inputText'
    | 'inputImage'
    | 'commandExecution'
    | 'fileChange'
    | 'reasoning'
    | 'plan'
    | 'toolCall'
    | 'mcpToolCall'
    | 'dynamicToolCall'
    | 'collabToolCall'
    | 'webSearch'
    | 'imageView'
    | 'contextCompaction'
    | 'enteredReviewMode'
    | 'exitedReviewMode'
    | 'directive'
    | 'taskStatus'
    | 'unknown'
  rawType?: string
  rawFamily?: 'response_item' | 'event_msg' | 'delta' | 'history'
  semanticCategory?:
    | 'message'
    | 'reasoning'
    | 'plan'
    | 'tool'
    | 'web'
    | 'directive'
    | 'task'
    | 'state'
    | 'fallback'
  phase?: string
  content: string
  command?: string
  output?: string
  parsedOutput?: unknown
  filePath?: string
  changeType?: string
  phaseLabel?: string
  status?: string
  cwd?: string
  toolName?: string
  server?: string
  argumentsText?: string
  resultText?: string
  query?: string
  actionType?: string
  actionTarget?: string
  summary?: string
  callId?: string
  callIds?: string[]
  agentId?: string
  turnId?: string
  linkedTaskIds?: string[]
  directive?: DirectiveCard
  completed: boolean
}

export type TranscriptItem = MessageItem

export type DirectiveKind =
  | 'automationUpdate'
  | 'codeComment'
  | 'inboxItem'
  | 'archiveThread'
  | 'archive'
  | 'unknown'

export interface DirectiveCard {
  id: string
  kind: DirectiveKind
  source: string
  title?: string
  summary?: string
  body?: string
  filePath?: string
  status?: string
  mode?: string
  prompt?: string
  name?: string
  rrule?: string
  reason?: string
  cwds?: string[]
  start?: number
  end?: number
  priority?: number
  confidence?: number
  attributes: Record<string, string | number | boolean>
}

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'historical'
  | 'unknown'

export interface TaskCard {
  id: string
  threadId: string
  status: TaskStatus
  title: string
  summary?: string
  startedAt?: number
  completedAt?: number
  agentId?: string
  turnId?: string
  nickname?: string
  lastMessage?: string
  linkedCallIds: string[]
  linkedTranscriptItemIds: string[]
  results: string[]
  rawType?: string
}

export interface NormalizedCodexEvent {
  id: string
  rawType: string
  rawFamily: 'response_item' | 'event_msg' | 'delta' | 'history'
  threadId?: string | null
  turnId?: string
  transcriptItems: TranscriptItem[]
  taskUpdates: TaskCard[]
  assistantText?: string
  rawPayload?: unknown
}

export interface MessageAttachment {
  id: string
  name: string
  path: string
  kind: 'image' | 'document'
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments: MessageAttachment[]
  items: MessageItem[]
  timestamp: number
  isStreaming: boolean
}

export interface Thread {
  id: string
  title: string
  project: string
  projectPath?: string
  createdAt: number
  messages: Message[]
  additions?: number
  deletions?: number
  pinned?: boolean
  pinnedOrder?: number
  unread?: boolean
  archived?: boolean
}

export type AppTab = 'threads' | 'skills' | 'settings'
export type CollaborationModeKind = 'default' | 'plan'
export type TurnPlanStepStatus = 'pending' | 'inProgress' | 'completed'

export interface TurnPlanStep {
  step: string
  status: TurnPlanStepStatus
}

export interface TurnPlanSnapshot {
  explanation?: string | null
  plan: TurnPlanStep[]
}

interface ApprovalRequest {
  id: string
  threadId: string
  kind: 'command' | 'fileChange'
  title: string
  description: string
  details?: string
  requestId?: number | string
}

export interface Project {
  path: string
  name: string
}

export type ThreadDetail = 'steps_with_code_commands' | 'assistant_only'
export type FollowUpBehavior = 'queue' | 'steer'
export type OpenDestination = 'cursor' | 'zed' | 'vscode' | 'ghostty'
export type UiLanguage = 'auto' | 'en'
export type InferenceSpeed = 'standard' | 'fast'
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export type Personality = 'friendly' | 'pragmatic' | 'none'

export interface AvailableModelReasoningEffort {
  reasoningEffort: ReasoningEffort
  description: string
}

export interface AvailableModel {
  id: string
  name: string
  defaultReasoningEffort: ReasoningEffort | null
  supportedReasoningEfforts: AvailableModelReasoningEffort[]
}

export interface AppSettings {
  defaultOpenDestination: OpenDestination
  language: UiLanguage
  threadDetail: ThreadDetail
  preventSleepWhileRunning: boolean
  requireMetaForMultiline: boolean
  speed: InferenceSpeed
  followUpBehavior: FollowUpBehavior
  themeId: string
  themeMode: ThemePreference
  opaqueWindowBackground: boolean
  chatSidebarWidth: number
  settingsSidebarWidth: number
  pointerCursors: boolean
  sansFontSize: number
  sansFontFamily: string
  codeFontSize: number
  codeFontFamily: string
  notificationChime: boolean
  personality: Personality
  customInstructions: string
}

export interface PersistedCodexStoreState {
  version: number
  threads: Thread[]
  tasksByThreadId: Record<string, TaskCard[]>
  activeThreadId: string | null
  activeTab: AppTab
  activeProject: Project | null
  recentProjects: Project[]
  model: string
  reasoningEffort: ReasoningEffort | null
  autonomyLevel: string
  planModeEnabled: boolean
  isSidebarOpen: boolean
  settings: AppSettings
}

type PersistedAppSettings = Partial<AppSettings> & {
  theme?: ThemePreference
}

interface CodexStore {
  threads: Thread[]
  tasksByThreadId: Record<string, TaskCard[]>
  activeThreadId: string | null
  activeTab: AppTab
  activeProject: Project | null
  recentProjects: Project[]
  model: string
  reasoningEffort: ReasoningEffort | null
  autonomyLevel: string
  isStreaming: boolean
  streamingThreadId: string | null
  isSidebarOpen: boolean
  isAuthenticated: boolean
  serverReady: boolean
  availableModels: AvailableModel[]
  approvalRequest: ApprovalRequest | null
  activeTurnThreadId: string | null
  activeTurnId: string | null
  activeTurnMode: CollaborationModeKind | null
  activeTurnPlan: TurnPlanSnapshot | null
  planModeEnabled: boolean
  isPlanSheetOpen: boolean
  selectedPlanPath: string | null
  themes: ThemeCatalogEntry[]
  settings: AppSettings

  setAvailableModels: (models: AvailableModel[]) => void
  setActiveProject: (project: Project | null) => void
  createThread: (id: string, title?: string, project?: string, projectPath?: string) => void
  remapThreadId: (fromId: string, toId: string) => void
  setActiveThread: (id: string | null) => void
  setActiveTab: (tab: AppTab) => void
  deleteThread: (id: string) => void
  updateThreadTitle: (id: string, title: string) => void
  toggleThreadPinned: (id: string) => void
  reorderPinnedThreads: (orderedIds: string[]) => void
  setThreadArchived: (id: string, archived: boolean) => void
  markThreadUnread: (id: string, unread: boolean) => void
  cloneThread: (id: string, project?: string, projectPath?: string) => string | null
  replaceThreads: (threads: Thread[]) => void
  replaceTasksByThread: (tasksByThreadId: Record<string, TaskCard[]>) => void
  setTasksForThread: (threadId: string, tasks: TaskCard[]) => void
  upsertTask: (threadId: string, task: TaskCard) => void
  updateTask: (threadId: string, taskId: string, updates: Partial<TaskCard>) => void

  addMessage: (threadId: string, message: Message) => void
  updateMessage: (threadId: string, messageId: string, updates: Partial<Message>) => void
  appendToMessage: (threadId: string, messageId: string, text: string) => void
  addItemToMessage: (threadId: string, messageId: string, item: MessageItem) => void
  replaceMessageItems: (threadId: string, messageId: string, items: MessageItem[]) => void
  appendToItemContent: (
    threadId: string,
    messageId: string,
    itemId: string,
    itemType: MessageItem['type'],
    text: string
  ) => void
  updateItem: (
    threadId: string,
    messageId: string,
    itemId: string,
    updates: Partial<MessageItem>
  ) => void
  completeMessageItems: (
    threadId: string,
    messageId: string,
    updates?: Partial<MessageItem>
  ) => void
  appendToItemOutput: (threadId: string, messageId: string, itemId: string, text: string) => void

  setModel: (model: string) => void
  setReasoningEffort: (effort: ReasoningEffort | null) => void
  setAutonomyLevel: (level: string) => void
  setIsStreaming: (streaming: boolean) => void
  setStreamingThread: (threadId: string | null) => void
  setIsSidebarOpen: (open: boolean) => void
  setAuthenticated: (auth: boolean) => void
  setServerReady: (ready: boolean) => void
  setApprovalRequest: (req: ApprovalRequest | null) => void
  setActiveTurn: (
    threadId: string,
    turnId: string | null,
    mode?: CollaborationModeKind | null
  ) => void
  setActiveTurnPlan: (plan: TurnPlanSnapshot | null) => void
  clearActiveTurn: () => void
  setPlanModeEnabled: (enabled: boolean) => void
  setPlanSheetOpen: (open: boolean) => void
  setSelectedPlanPath: (path: string | null) => void
  setThemes: (themes: ThemeCatalogEntry[]) => void
  updateSettings: (updates: Partial<AppSettings>) => void
  hydrateFromPersistedState: (state: Partial<PersistedCodexStoreState>) => void
}

function normalizeOpenDestination(value: unknown): OpenDestination {
  switch (value) {
    case 'cursor':
    case 'zed':
    case 'vscode':
    case 'ghostty':
      return value
    case 'finder':
      return 'zed'
    default:
      return 'zed'
  }
}

function getCompatibleReasoningEffort(
  model: AvailableModel | undefined,
  effort: ReasoningEffort | null
): ReasoningEffort | null {
  if (effort == null) return null

  const supported = model?.supportedReasoningEfforts.map((option) => option.reasoningEffort) || []
  if (supported.length === 0 || supported.includes(effort)) {
    return effort
  }

  return model?.defaultReasoningEffort ?? null
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export { timeAgo }

function mergeStreamOutput(existing: string, incoming: string): string {
  if (!incoming) return existing
  if (!existing) return incoming
  if (incoming === existing) return existing
  if (incoming.startsWith(existing)) return incoming
  if (existing.startsWith(incoming)) return existing
  if (incoming.includes(existing)) return incoming
  if (existing.includes(incoming)) return existing

  const maxOverlap = Math.min(existing.length, incoming.length)
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (existing.endsWith(incoming.slice(0, overlap))) {
      return existing + incoming.slice(overlap)
    }
  }

  return existing + incoming
}

function normalizePersistedSettings(
  persistedSettings: PersistedAppSettings | undefined,
  currentSettings: AppSettings
): AppSettings {
  const legacyTheme = persistedSettings?.theme
  const persistedSettingsWithoutLegacyTheme = { ...(persistedSettings || {}) }
  delete persistedSettingsWithoutLegacyTheme.theme
  const nextThemeMode =
    persistedSettings?.themeMode ??
    (legacyTheme === 'light' || legacyTheme === 'dark' || legacyTheme === 'system'
      ? legacyTheme
      : currentSettings.themeMode)

  return {
    ...currentSettings,
    ...persistedSettingsWithoutLegacyTheme,
    themeId: persistedSettings?.themeId || DEFAULT_THEME_ID,
    themeMode: nextThemeMode,
    defaultOpenDestination: normalizeOpenDestination(persistedSettings?.defaultOpenDestination)
  }
}

function mergePersistedCodexStoreState<
  T extends Pick<
    CodexStore,
    | 'threads'
    | 'tasksByThreadId'
    | 'activeThreadId'
    | 'activeTab'
    | 'activeProject'
    | 'recentProjects'
    | 'model'
    | 'reasoningEffort'
    | 'autonomyLevel'
    | 'planModeEnabled'
    | 'isSidebarOpen'
    | 'settings'
  >
>(persistedState: Partial<PersistedCodexStoreState> | undefined, currentState: T): T {
  const typedPersisted = persistedState || {}
  const isCurrentVersion = typedPersisted.version === 2 || typedPersisted.version === 3

  // Clear stale streaming flags on messages — no stream survives a restart.
  const threads = (isCurrentVersion ? typedPersisted.threads || [] : []).map((thread) => ({
    ...thread,
    messages: thread.messages.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false } : msg))
  }))

  const tasksByThreadId = isCurrentVersion ? typedPersisted.tasksByThreadId || {} : {}
  const activeThreadId =
    typedPersisted.activeThreadId &&
    threads.some((thread) => thread.id === typedPersisted.activeThreadId)
      ? typedPersisted.activeThreadId
      : currentState.activeThreadId

  return {
    ...currentState,
    ...typedPersisted,
    threads,
    tasksByThreadId,
    activeThreadId,
    settings: normalizePersistedSettings(typedPersisted.settings, currentState.settings)
  } as T
}

export function buildPersistedCodexStoreState(
  state: Pick<
    CodexStore,
    | 'threads'
    | 'tasksByThreadId'
    | 'activeThreadId'
    | 'activeTab'
    | 'activeProject'
    | 'recentProjects'
    | 'model'
    | 'reasoningEffort'
    | 'autonomyLevel'
    | 'planModeEnabled'
    | 'isSidebarOpen'
    | 'settings'
  >
): PersistedCodexStoreState {
  return {
    version: 3,
    threads: state.threads,
    tasksByThreadId: state.tasksByThreadId,
    activeThreadId: state.activeThreadId,
    activeTab: state.activeTab,
    activeProject: state.activeProject,
    recentProjects: state.recentProjects,
    model: state.model,
    reasoningEffort: state.reasoningEffort,
    autonomyLevel: state.autonomyLevel,
    planModeEnabled: state.planModeEnabled,
    isSidebarOpen: state.isSidebarOpen,
    settings: state.settings
  }
}

export const useCodexStore = create<CodexStore>()(
  persist(
    (set, get) => ({
      threads: [],
      tasksByThreadId: {},
      activeThreadId: null,
      activeTab: 'threads',
      activeProject: null,
      recentProjects: [],
      model: 'gpt-5.3-codex',
      reasoningEffort: null,
      autonomyLevel: 'Hand off',
      isStreaming: false,
      streamingThreadId: null,
      isSidebarOpen: true,
      isAuthenticated: false,
      serverReady: false,
      availableModels: [],
      approvalRequest: null,
      activeTurnThreadId: null,
      activeTurnId: null,
      activeTurnMode: null,
      activeTurnPlan: null,
      planModeEnabled: false,
      isPlanSheetOpen: false,
      selectedPlanPath: null,
      themes: BUILT_IN_THEMES,
      settings: {
        defaultOpenDestination: 'zed',
        language: 'auto',
        threadDetail: 'steps_with_code_commands',
        preventSleepWhileRunning: false,
        requireMetaForMultiline: true,
        speed: 'standard',
        followUpBehavior: 'queue',
        themeId: DEFAULT_THEME_ID,
        themeMode: 'system',
        opaqueWindowBackground: false,
        chatSidebarWidth: 260,
        settingsSidebarWidth: 248,
        pointerCursors: true,
        sansFontSize: 14,
        sansFontFamily: 'System',
        codeFontSize: 13,
        codeFontFamily: 'SF Mono',
        notificationChime: true,
        personality: 'friendly',
        customInstructions: ''
      },

      setActiveProject: (project) =>
        set((state) => {
          if (!project) return { activeProject: null }
          const exists = state.recentProjects.some((p) => p.path === project.path)
          return {
            activeProject: project,
            recentProjects: exists
              ? state.recentProjects
              : [project, ...state.recentProjects].slice(0, 10)
          }
        }),

      createThread: (id, title, project, projectPath) =>
        set((state) => ({
          threads: [
            {
              id,
              title: title || 'New Thread',
              project: project || state.activeProject?.name || 'local',
              projectPath: projectPath || state.activeProject?.path,
              createdAt: Date.now(),
              messages: [],
              pinned: false,
              unread: false,
              archived: false
            },
            ...state.threads
          ],
          tasksByThreadId: {
            ...state.tasksByThreadId,
            [id]: state.tasksByThreadId[id] || []
          },
          activeThreadId: id
        })),

      remapThreadId: (fromId, toId) => {
        if (!fromId || !toId || fromId === toId) return
        set((state) => {
          if (state.threads.some((t) => t.id === toId)) {
            return {
              threads: state.threads.filter((t) => t.id !== fromId),
              activeThreadId: state.activeThreadId === fromId ? toId : state.activeThreadId,
              streamingThreadId:
                state.streamingThreadId === fromId ? toId : state.streamingThreadId,
              activeTurnThreadId:
                state.activeTurnThreadId === fromId ? toId : state.activeTurnThreadId,
              tasksByThreadId: Object.fromEntries(
                Object.entries(state.tasksByThreadId)
                  .filter(([threadId]) => threadId !== fromId)
                  .map(([threadId, tasks]) => [threadId === fromId ? toId : threadId, tasks])
              ),
              approvalRequest:
                state.approvalRequest?.threadId === fromId
                  ? { ...state.approvalRequest, threadId: toId }
                  : state.approvalRequest
            }
          }

          return {
            threads: state.threads.map((t) => (t.id === fromId ? { ...t, id: toId } : t)),
            activeThreadId: state.activeThreadId === fromId ? toId : state.activeThreadId,
            streamingThreadId: state.streamingThreadId === fromId ? toId : state.streamingThreadId,
            activeTurnThreadId:
              state.activeTurnThreadId === fromId ? toId : state.activeTurnThreadId,
            tasksByThreadId: Object.fromEntries(
              Object.entries(state.tasksByThreadId).map(([threadId, tasks]) => [
                threadId === fromId ? toId : threadId,
                tasks.map((task) => (task.threadId === fromId ? { ...task, threadId: toId } : task))
              ])
            ),
            approvalRequest:
              state.approvalRequest?.threadId === fromId
                ? { ...state.approvalRequest, threadId: toId }
                : state.approvalRequest
          }
        })
      },

      setActiveThread: (id) =>
        set((state) => ({
          activeThreadId: id,
          threads:
            id == null
              ? state.threads
              : state.threads.map((t) => (t.id === id ? { ...t, unread: false } : t))
        })),
      setActiveTab: (activeTab) => set({ activeTab }),

      deleteThread: (id) =>
        set((state) => ({
          threads: state.threads.filter((t) => t.id !== id),
          tasksByThreadId: Object.fromEntries(
            Object.entries(state.tasksByThreadId).filter(([threadId]) => threadId !== id)
          ),
          activeThreadId: state.activeThreadId === id ? null : state.activeThreadId
        })),

      updateThreadTitle: (id, title) =>
        set((state) => ({
          threads: state.threads.map((t) => (t.id === id ? { ...t, title } : t))
        })),

      toggleThreadPinned: (id) =>
        set((state) => ({
          threads: state.threads.map((t) => {
            if (t.id !== id) return t
            const nextPinned = !t.pinned
            return {
              ...t,
              pinned: nextPinned,
              pinnedOrder: nextPinned ? Date.now() : undefined,
              archived: nextPinned ? false : t.archived
            }
          })
        })),

      reorderPinnedThreads: (orderedIds) =>
        set((state) => ({
          threads: state.threads.map((t) => {
            const index = orderedIds.indexOf(t.id)
            if (index === -1) return t
            return { ...t, pinnedOrder: index }
          })
        })),

      setThreadArchived: (id, archived) =>
        set((state) => {
          const threads = state.threads.map((t) =>
            t.id === id
              ? {
                  ...t,
                  archived,
                  pinned: archived ? false : t.pinned
                }
              : t
          )
          const activeThreadId =
            archived && state.activeThreadId === id
              ? (threads.find((t) => !t.archived)?.id ?? null)
              : state.activeThreadId
          return { threads, activeThreadId }
        }),

      markThreadUnread: (id, unread) =>
        set((state) => ({
          threads: state.threads.map((t) => (t.id === id ? { ...t, unread } : t))
        })),

      cloneThread: (id, project, projectPath) => {
        const source = get().threads.find((t) => t.id === id)
        if (!source) return null
        const clonedId = crypto.randomUUID()
        const clonedThread: Thread = {
          ...source,
          id: clonedId,
          title: `${source.title} (fork)`,
          project: project || source.project || 'local',
          projectPath: projectPath ?? source.projectPath,
          createdAt: Date.now(),
          messages: source.messages.map((message) => ({
            ...message,
            items: message.items.map((item) => ({ ...item }))
          })),
          pinned: false,
          unread: false,
          archived: false
        }

        set((state) => ({
          threads: [clonedThread, ...state.threads],
          tasksByThreadId: {
            ...state.tasksByThreadId,
            [clonedId]: []
          },
          activeThreadId: clonedId
        }))

        return clonedId
      },

      replaceThreads: (threads) =>
        set((state) => ({
          threads,
          activeThreadId:
            state.activeThreadId && threads.some((thread) => thread.id === state.activeThreadId)
              ? state.activeThreadId
              : (threads[0]?.id ?? null)
        })),

      replaceTasksByThread: (tasksByThreadId) => set({ tasksByThreadId }),

      setTasksForThread: (threadId, tasks) =>
        set((state) => ({
          tasksByThreadId: {
            ...state.tasksByThreadId,
            [threadId]: tasks
          }
        })),

      upsertTask: (threadId, task) =>
        set((state) => {
          const existingTasks = state.tasksByThreadId[threadId] || []
          const alreadyExists = existingTasks.some((entry) => entry.id === task.id)
          return {
            tasksByThreadId: {
              ...state.tasksByThreadId,
              [threadId]: alreadyExists
                ? existingTasks.map((entry) =>
                    entry.id === task.id ? { ...entry, ...task } : entry
                  )
                : [...existingTasks, task]
            }
          }
        }),

      updateTask: (threadId, taskId, updates) =>
        set((state) => ({
          tasksByThreadId: {
            ...state.tasksByThreadId,
            [threadId]: (state.tasksByThreadId[threadId] || []).map((task) =>
              task.id === taskId ? { ...task, ...updates } : task
            )
          }
        })),

      addMessage: (threadId, message) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId ? { ...t, messages: [...t.messages, message] } : t
          )
        })),

      updateMessage: (threadId, messageId, updates) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.map((m) => (m.id === messageId ? { ...m, ...updates } : m))
                }
              : t
          )
        })),

      appendToMessage: (threadId, messageId, text) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id === messageId ? { ...m, content: m.content + text } : m
                  )
                }
              : t
          )
        })),

      addItemToMessage: (threadId, messageId, item) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id === messageId
                      ? {
                          ...m,
                          items: m.items.some((i) => i.id === item.id)
                            ? m.items.map((i) =>
                                i.id === item.id
                                  ? {
                                      ...i,
                                      ...item,
                                      type: item.type === 'unknown' ? i.type : item.type,
                                      content: item.content || i.content,
                                      output: item.output || i.output,
                                      summary: item.summary || i.summary
                                    }
                                  : i
                              )
                            : [...m.items, item]
                        }
                      : m
                  )
                }
              : t
          )
        })),

      replaceMessageItems: (threadId, messageId, items) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.map((m) => (m.id === messageId ? { ...m, items } : m))
                }
              : t
          )
        })),

      appendToItemContent: (threadId, messageId, itemId, itemType, text) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id === messageId
                      ? {
                          ...m,
                          items: m.items.some((i) => i.id === itemId)
                            ? m.items.map((i) =>
                                i.id === itemId ? { ...i, content: `${i.content || ''}${text}` } : i
                              )
                            : [
                                ...m.items,
                                {
                                  id: itemId,
                                  type: itemType,
                                  content: text,
                                  completed: false
                                }
                              ]
                        }
                      : m
                  )
                }
              : t
          )
        })),

      updateItem: (threadId, messageId, itemId, updates) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id === messageId
                      ? {
                          ...m,
                          items: m.items.map((i) => (i.id === itemId ? { ...i, ...updates } : i))
                        }
                      : m
                  )
                }
              : t
          )
        })),

      completeMessageItems: (threadId, messageId, updates = {}) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id === messageId
                      ? {
                          ...m,
                          items: m.items.map((i) =>
                            i.completed ? i : { ...i, ...updates, completed: true }
                          )
                        }
                      : m
                  )
                }
              : t
          )
        })),

      appendToItemOutput: (threadId, messageId, itemId, text) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id === messageId
                      ? {
                          ...m,
                          items: m.items.map((i) =>
                            i.id === itemId
                              ? {
                                  ...i,
                                  output: mergeStreamOutput(i.output || '', text)
                                }
                              : i
                          )
                        }
                      : m
                  )
                }
              : t
          )
        })),

      setModel: (model) =>
        set((state) => ({
          model,
          reasoningEffort: getCompatibleReasoningEffort(
            state.availableModels.find((entry) => entry.id === model),
            state.reasoningEffort
          )
        })),
      setReasoningEffort: (reasoningEffort) =>
        set((state) => ({
          reasoningEffort: getCompatibleReasoningEffort(
            state.availableModels.find((entry) => entry.id === state.model),
            reasoningEffort
          )
        })),
      setAutonomyLevel: (autonomyLevel) => set({ autonomyLevel }),
      setIsStreaming: (isStreaming) => set({ isStreaming }),
      setStreamingThread: (streamingThreadId) => set({ streamingThreadId }),
      setIsSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      setServerReady: (serverReady) => set({ serverReady }),
      setAvailableModels: (availableModels) =>
        set((state) => ({
          availableModels,
          reasoningEffort: getCompatibleReasoningEffort(
            availableModels.find((entry) => entry.id === state.model),
            state.reasoningEffort
          )
        })),
      setApprovalRequest: (approvalRequest) => set({ approvalRequest }),
      setActiveTurn: (threadId, turnId, mode) =>
        set((state) => ({
          activeTurnThreadId: threadId,
          activeTurnId: turnId,
          activeTurnMode: mode ?? state.activeTurnMode,
          activeTurnPlan: mode === undefined ? state.activeTurnPlan : null
        })),
      setActiveTurnPlan: (activeTurnPlan) => set({ activeTurnPlan }),
      clearActiveTurn: () =>
        set({
          activeTurnThreadId: null,
          activeTurnId: null,
          activeTurnMode: null,
          activeTurnPlan: null
        }),
      setPlanModeEnabled: (planModeEnabled) => set({ planModeEnabled }),
      setPlanSheetOpen: (isPlanSheetOpen) => set({ isPlanSheetOpen }),
      setSelectedPlanPath: (selectedPlanPath) => set({ selectedPlanPath }),
      setThemes: (themes) => set({ themes }),
      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates }
        })),
      hydrateFromPersistedState: (persistedState) =>
        set((state) => mergePersistedCodexStoreState(persistedState, state))
    }),
    {
      name: 'codex-store',
      merge: (persistedState, currentState) =>
        mergePersistedCodexStoreState(
          persistedState as Partial<PersistedCodexStoreState>,
          currentState
        ),
      partialize: (state) => buildPersistedCodexStoreState(state)
    }
  )
)
