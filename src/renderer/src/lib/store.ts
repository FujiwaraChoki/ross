import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface MessageItem {
  id: string
  type:
    | 'agentMessage'
    | 'commandExecution'
    | 'fileChange'
    | 'reasoning'
    | 'plan'
    | 'mcpToolCall'
    | 'dynamicToolCall'
    | 'collabToolCall'
    | 'webSearch'
    | 'imageView'
    | 'contextCompaction'
    | 'enteredReviewMode'
    | 'exitedReviewMode'
    | 'unknown'
  content: string
  command?: string
  output?: string
  filePath?: string
  changeType?: string
  phase?: string
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
  completed: boolean
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
  unread?: boolean
  archived?: boolean
}

export type AppTab = 'threads' | 'skills' | 'settings'

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

export type ThemePreference = 'light' | 'dark' | 'system'
export type ThreadDetail = 'steps_with_code_commands' | 'assistant_only'
export type FollowUpBehavior = 'queue' | 'steer'
export type OpenDestination = 'cursor' | 'zed' | 'vscode' | 'ghostty'
export type UiLanguage = 'auto' | 'en'
export type InferenceSpeed = 'standard' | 'fast'

export type Personality = 'friendly' | 'pragmatic' | 'none'

export interface AppSettings {
  defaultOpenDestination: OpenDestination
  language: UiLanguage
  threadDetail: ThreadDetail
  preventSleepWhileRunning: boolean
  requireMetaForMultiline: boolean
  speed: InferenceSpeed
  followUpBehavior: FollowUpBehavior
  theme: ThemePreference
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

interface CodexStore {
  threads: Thread[]
  activeThreadId: string | null
  activeTab: AppTab
  activeProject: Project | null
  recentProjects: Project[]
  model: string
  autonomyLevel: string
  isStreaming: boolean
  streamingThreadId: string | null
  isSidebarOpen: boolean
  isAuthenticated: boolean
  approvalRequest: ApprovalRequest | null
  activeTurnThreadId: string | null
  activeTurnId: string | null
  settings: AppSettings

  setActiveProject: (project: Project | null) => void
  createThread: (id: string, title?: string, project?: string, projectPath?: string) => void
  remapThreadId: (fromId: string, toId: string) => void
  setActiveThread: (id: string | null) => void
  setActiveTab: (tab: AppTab) => void
  deleteThread: (id: string) => void
  updateThreadTitle: (id: string, title: string) => void
  toggleThreadPinned: (id: string) => void
  setThreadArchived: (id: string, archived: boolean) => void
  markThreadUnread: (id: string, unread: boolean) => void
  cloneThread: (id: string, project?: string, projectPath?: string) => string | null

  addMessage: (threadId: string, message: Message) => void
  updateMessage: (threadId: string, messageId: string, updates: Partial<Message>) => void
  appendToMessage: (threadId: string, messageId: string, text: string) => void
  addItemToMessage: (threadId: string, messageId: string, item: MessageItem) => void
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
  setAutonomyLevel: (level: string) => void
  setIsStreaming: (streaming: boolean) => void
  setStreamingThread: (threadId: string | null) => void
  setIsSidebarOpen: (open: boolean) => void
  setAuthenticated: (auth: boolean) => void
  setApprovalRequest: (req: ApprovalRequest | null) => void
  setActiveTurn: (threadId: string, turnId: string) => void
  clearActiveTurn: () => void
  updateSettings: (updates: Partial<AppSettings>) => void
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

export const useCodexStore = create<CodexStore>()(
  persist(
    (set, get) => ({
      threads: [],
      activeThreadId: null,
      activeTab: 'threads',
      activeProject: null,
      recentProjects: [],
      model: 'gpt-5.3-codex',
      autonomyLevel: 'Hand off',
      isStreaming: false,
      streamingThreadId: null,
      isSidebarOpen: true,
      isAuthenticated: false,
      approvalRequest: null,
      activeTurnThreadId: null,
      activeTurnId: null,
      settings: {
        defaultOpenDestination: 'zed',
        language: 'auto',
        threadDetail: 'steps_with_code_commands',
        preventSleepWhileRunning: false,
        requireMetaForMultiline: true,
        speed: 'standard',
        followUpBehavior: 'queue',
        theme: 'system',
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
              archived: nextPinned ? false : t.archived
            }
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
          activeThreadId: clonedId
        }))

        return clonedId
      },

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

      setModel: (model) => set({ model }),
      setAutonomyLevel: (autonomyLevel) => set({ autonomyLevel }),
      setIsStreaming: (isStreaming) => set({ isStreaming }),
      setStreamingThread: (streamingThreadId) => set({ streamingThreadId }),
      setIsSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      setApprovalRequest: (approvalRequest) => set({ approvalRequest }),
      setActiveTurn: (threadId, turnId) =>
        set({
          activeTurnThreadId: threadId,
          activeTurnId: turnId
        }),
      clearActiveTurn: () =>
        set({
          activeTurnThreadId: null,
          activeTurnId: null
        }),
      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates }
        }))
    }),
    {
      name: 'codex-store',
      merge: (persistedState, currentState) => {
        const typedPersisted = (persistedState as Partial<CodexStore>) || {}
        const persistedSettings: Partial<AppSettings> = typedPersisted.settings || {}

        // Clear stale isStreaming flags on messages — no stream survives a restart
        const threads = (typedPersisted.threads || []).map((thread) => ({
          ...thread,
          messages: thread.messages.map((msg) =>
            msg.isStreaming ? { ...msg, isStreaming: false } : msg
          )
        }))

        return {
          ...currentState,
          ...typedPersisted,
          threads,
          settings: {
            ...currentState.settings,
            ...persistedSettings,
            defaultOpenDestination: normalizeOpenDestination(
              persistedSettings.defaultOpenDestination
            )
          }
        }
      },
      partialize: (state) => ({
        threads: state.threads,
        activeTab: state.activeTab,
        activeProject: state.activeProject,
        recentProjects: state.recentProjects,
        model: state.model,
        autonomyLevel: state.autonomyLevel,
        isSidebarOpen: state.isSidebarOpen,
        settings: state.settings
      })
    }
  )
)
