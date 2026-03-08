import { useCallback, useEffect, useRef, type ReactElement } from 'react'
import { useCodexStore, type MessageItem } from '@/lib/store'
import {
  canApplyServerThreadTitle,
  deriveAutomaticThreadTitle,
  isPlaceholderThreadTitle,
  normalizeThreadTitleCandidate
} from '@/lib/thread-titles'
import LoginScreen from '@/components/login-screen'
import AppSidebar from '@/components/app-sidebar'
import Header from '@/components/header'
import Chat from '@/components/chat'
import SkillsTab from '@/components/skills-tab'
import SettingsTab from '@/components/settings-tab'
import ApprovalDialog from '@/components/approval-dialog'
import CommandBar from '@/components/command-bar'
import { applyUiPreferences } from '@/lib/ui-preferences'

type EventPayload = Record<string, unknown>

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function extractText(value: unknown, depth = 0): string | undefined {
  if (depth > 4 || value == null) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => extractText(entry, depth + 1))
      .filter((entry): entry is string => Boolean(entry))
    return parts.length ? parts.join('\n') : undefined
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const priorityKeys = ['summaryText', 'text', 'delta', 'output', 'content', 'summary']
    for (const key of priorityKeys) {
      const text = extractText(obj[key], depth + 1)
      if (text) return text
    }
  }

  return undefined
}

function getEventItem(params: EventPayload): EventPayload {
  const nested = asObject(params.item)
  return nested || params
}

function stringifyValue(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function choosePreferredText(existing: string | undefined, incoming: string | undefined): string {
  const current = existing?.trim() ? existing : ''
  const next = incoming?.trim() ? incoming : ''
  if (!current) return next
  if (!next) return current
  if (next === current) return current
  if (next.includes(current)) return next
  if (current.includes(next)) return current
  return next.length >= current.length ? next : current
}

function getTurnIdFromParams(params: EventPayload): string | undefined {
  return (
    getString(asObject(params.turn)?.id) || getString(params.turnId) || getString(params.turn_id)
  )
}

function getThreadIdFromParams(params: EventPayload): string | undefined {
  return getString(params.threadId) || getString(params.thread_id)
}

function getTurnStatusFromParams(params: EventPayload): string | undefined {
  return getString(asObject(params.turn)?.status) || getString(params.status)
}

function getErrorMessageFromParams(params: EventPayload): string | null {
  const error = asObject(params.error)
  const message = extractText(error?.message) || extractText(params.message)
  const details = extractText(error?.additionalDetails)
  const codexErrorInfo = getString(error?.codexErrorInfo)
  const httpStatusCode =
    typeof error?.httpStatusCode === 'number' ? `HTTP ${error.httpStatusCode}` : null

  const metadata = [codexErrorInfo, httpStatusCode].filter(Boolean).join(' | ')
  const parts = [
    message ? `Codex stopped: ${message}` : '',
    metadata,
    details && details !== message ? details : ''
  ].filter(Boolean)

  return parts.length > 0 ? parts.join('\n\n') : null
}

function getStreamingThreadId(
  threads: ReturnType<typeof useCodexStore.getState>['threads']
): string | null {
  const streamingThreads = threads.filter((thread) =>
    thread.messages.some((message) => message.isStreaming)
  )
  return streamingThreads.length === 1 ? streamingThreads[0].id : null
}

function getAssistantMessageIdForThread(
  threads: ReturnType<typeof useCodexStore.getState>['threads'],
  threadId: string
): string | null {
  const thread = threads.find((entry) => entry.id === threadId)
  if (!thread) return null

  const activeAssistant = thread.messages.findLast(
    (message) => message.role === 'assistant' && message.isStreaming
  )
  if (activeAssistant) return activeAssistant.id

  return thread.messages.findLast((message) => message.role === 'assistant')?.id || null
}

function resolveThreadIdForEvent(
  params: EventPayload,
  state: Pick<
    ReturnType<typeof useCodexStore.getState>,
    'threads' | 'activeTurnId' | 'activeTurnThreadId' | 'streamingThreadId'
  >
): string | null {
  const eventThreadId = getThreadIdFromParams(params)
  if (eventThreadId) return eventThreadId

  const eventTurnId = getTurnIdFromParams(params)
  if (eventTurnId && state.activeTurnId === eventTurnId && state.activeTurnThreadId) {
    return state.activeTurnThreadId
  }

  if (state.activeTurnThreadId) {
    return state.activeTurnThreadId
  }

  if (state.streamingThreadId) {
    return state.streamingThreadId
  }

  return getStreamingThreadId(state.threads)
}

function normalizeItemType(rawType: string | undefined): MessageItem['type'] {
  switch (rawType) {
    case 'agentMessage':
    case 'agent_message':
      return 'agentMessage'
    case 'commandExecution':
    case 'command_execution':
      return 'commandExecution'
    case 'fileChange':
    case 'file_change':
      return 'fileChange'
    case 'reasoning':
      return 'reasoning'
    case 'plan':
      return 'plan'
    case 'mcpToolCall':
    case 'mcp_tool_call':
      return 'mcpToolCall'
    case 'dynamicToolCall':
    case 'dynamic_tool_call':
      return 'dynamicToolCall'
    case 'collabToolCall':
    case 'collab_tool_call':
      return 'collabToolCall'
    case 'webSearch':
    case 'web_search':
      return 'webSearch'
    case 'imageView':
    case 'image_view':
      return 'imageView'
    case 'contextCompaction':
    case 'context_compaction':
      return 'contextCompaction'
    case 'enteredReviewMode':
    case 'entered_review_mode':
      return 'enteredReviewMode'
    case 'exitedReviewMode':
    case 'exited_review_mode':
      return 'exitedReviewMode'
    default:
      return 'unknown'
  }
}

function isSkippableItem(rawItem: EventPayload): boolean {
  const rawType = getString(rawItem.type)
  if (!rawType) return false
  return rawType === 'userMessage' || rawType === 'user_message'
}

function isToolLikeItemType(type: MessageItem['type']): boolean {
  return (
    type === 'mcpToolCall' ||
    type === 'dynamicToolCall' ||
    type === 'collabToolCall' ||
    type === 'webSearch' ||
    type === 'imageView' ||
    type === 'contextCompaction' ||
    type === 'enteredReviewMode' ||
    type === 'exitedReviewMode' ||
    type === 'unknown'
  )
}

function buildItemUpdates(rawItem: EventPayload): Partial<MessageItem> {
  const type = normalizeItemType(getString(rawItem.type))
  const changes = Array.isArray(rawItem.changes) ? rawItem.changes : []
  const firstChange = asObject(changes[0])
  const action = asObject(rawItem.action)

  let content = ''
  if (type === 'agentMessage' || type === 'plan' || type === 'reasoning') {
    content =
      extractText(rawItem.text) ||
      extractText(rawItem.content) ||
      extractText(rawItem.summary) ||
      ''
  } else if (type === 'fileChange') {
    content =
      extractText(firstChange?.diff) ||
      extractText(rawItem.output) ||
      extractText(rawItem.content) ||
      ''
  } else if (!isToolLikeItemType(type)) {
    content = extractText(rawItem.text) || extractText(rawItem.summary) || ''
  }

  return {
    type,
    content,
    phase: getString(rawItem.phase),
    status: getString(rawItem.status),
    command: getString(rawItem.command),
    cwd: getString(rawItem.cwd),
    output:
      getString(rawItem.aggregatedOutput) ||
      getString(rawItem.output) ||
      (type === 'commandExecution' ? getString(rawItem.content) : undefined),
    filePath: getString(firstChange?.path) || getString(rawItem.filePath),
    changeType: getString(firstChange?.kind) || getString(rawItem.changeType),
    toolName: getString(rawItem.tool),
    server: getString(rawItem.server),
    argumentsText: stringifyValue(rawItem.arguments),
    resultText: stringifyValue(rawItem.result),
    query: getString(rawItem.query),
    actionType: getString(action?.type),
    actionTarget:
      getString(action?.query) || getString(action?.url) || getString(action?.pattern) || undefined,
    summary: extractText(rawItem.summary)
  }
}

function buildMessageItem(rawItem: EventPayload): MessageItem {
  const id = getString(rawItem.id) || getString(rawItem.itemId) || crypto.randomUUID()
  return {
    id,
    completed: false,
    content: '',
    type: 'unknown',
    ...buildItemUpdates(rawItem)
  }
}

function getThreadTitleFromResult(result: unknown): string | null {
  const thread = asObject(asObject(result)?.thread)
  if (!thread) return null

  return (
    normalizeThreadTitleCandidate(thread.name) ||
    normalizeThreadTitleCandidate(thread.preview) ||
    null
  )
}

export default function App(): ReactElement {
  const {
    isAuthenticated,
    setAuthenticated,
    threads,
    setIsStreaming,
    approvalRequest,
    setApprovalRequest,
    remapThreadId,
    markThreadUnread,
    setStreamingThread,
    setActiveTurn,
    clearActiveTurn,
    activeTab,
    setActiveTab,
    activeProject,
    createThread,
    updateThreadTitle,
    updateMessage,
    appendToMessage,
    addItemToMessage,
    appendToItemContent,
    updateItem,
    completeMessageItems,
    appendToItemOutput,
    settings,
    isStreaming
  } = useCodexStore()

  const hasAppliedInitialSpeedPreferenceRef = useRef(false)
  const { isSidebarOpen, setIsSidebarOpen } = useCodexStore()

  const syncThreadTitleFromServer = useCallback(async (threadId: string): Promise<void> => {
    try {
      const result = await window.codex.threadRead({ threadId })
      const serverTitle = getThreadTitleFromResult(result)
      if (!serverTitle) return

      const store = useCodexStore.getState()
      const thread = store.threads.find((entry) => entry.id === threadId)
      if (!thread || thread.title === serverTitle) return
      if (!canApplyServerThreadTitle(thread, serverTitle)) return

      store.updateThreadTitle(threadId, serverTitle)
    } catch (error) {
      console.error(`Failed to sync thread title for ${threadId}:`, error)
    }
  }, [])

  const syncKnownThreadTitlesFromServer = useCallback(async (): Promise<void> => {
    const threadIds = useCodexStore.getState().threads.map((thread) => thread.id)
    if (threadIds.length === 0) return

    await Promise.allSettled(threadIds.map((threadId) => syncThreadTitleFromServer(threadId)))
  }, [syncThreadTitleFromServer])

  const addStatusItemToAssistant = useCallback(
    (threadId: string, messageId: string, itemId: string, text: string): void => {
      addItemToMessage(threadId, messageId, {
        id: itemId,
        type: 'agentMessage',
        content: text,
        completed: true
      })
    },
    [addItemToMessage]
  )

  const finalizeAssistantMessage = useCallback(
    (
      threadId: string,
      messageId: string,
      options?: {
        fallbackContent?: string
        itemStatus?: string
      }
    ): void => {
      updateMessage(threadId, messageId, {
        isStreaming: false,
        ...(options?.fallbackContent ? { content: options.fallbackContent } : {})
      })
      completeMessageItems(
        threadId,
        messageId,
        options?.itemStatus ? { status: options.itemStatus } : {}
      )
    },
    [completeMessageItems, updateMessage]
  )

  // Cmd+B to toggle sidebar, Cmd+, to toggle settings, Cmd/Ctrl+N for new thread
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'b') {
        e.preventDefault()
        setIsSidebarOpen(!isSidebarOpen)
      }
      if (mod && e.key === ',') {
        e.preventDefault()
        setActiveTab(activeTab === 'settings' ? 'threads' : 'settings')
      }
      if (mod && e.key === 'n') {
        e.preventDefault()
        const projectPath = activeProject?.path
        let id: string = crypto.randomUUID()
        window.codex
          .threadStart({ cwd: projectPath })
          .then((result) => {
            const thread = result as { thread?: { id?: string } } | undefined
            const serverId = thread?.thread?.id
            if (typeof serverId === 'string' && serverId) id = serverId
          })
          .catch((err) => console.error('Failed to start thread:', err))
          .finally(() => {
            createThread(id, undefined, activeProject?.name, projectPath)
            setActiveTab('threads')
          })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSidebarOpen, setIsSidebarOpen, activeTab, setActiveTab, activeProject, createThread])

  useEffect(() => {
    let cancelled = false

    void window.codex.isAuthenticated().then(async (auth) => {
      if (cancelled) return

      setAuthenticated(auth)
      if (auth) {
        try {
          await window.codex.startServer()
          if (!cancelled) {
            await syncKnownThreadTitlesFromServer()
          }
        } catch (error) {
          console.error(error)
        }
      }
    })

    return () => {
      cancelled = true
    }
  }, [setAuthenticated, syncKnownThreadTitlesFromServer])

  useEffect(() => {
    for (const thread of threads) {
      if (!isPlaceholderThreadTitle(thread.title)) continue

      const nextTitle = deriveAutomaticThreadTitle(thread)
      if (nextTitle && nextTitle !== thread.title) {
        updateThreadTitle(thread.id, nextTitle)
      }
    }
  }, [threads, updateThreadTitle])

  useEffect(() => {
    applyUiPreferences(settings)
  }, [settings])

  useEffect(() => {
    void window.codex
      .setKeepAwake(settings.preventSleepWhileRunning && isStreaming)
      .catch((error) => console.error('Failed to update keep-awake state:', error))
  }, [settings.preventSleepWhileRunning, isStreaming])

  useEffect(() => {
    void window.codex
      .setOpaqueWindowBackground(settings.opaqueWindowBackground)
      .catch((error) => console.error('Failed to update window opacity mode:', error))
  }, [settings.opaqueWindowBackground])

  useEffect(() => {
    if (!isAuthenticated) return

    if (!hasAppliedInitialSpeedPreferenceRef.current) {
      hasAppliedInitialSpeedPreferenceRef.current = true
      return
    }

    void window.codex
      .configValueWrite({
        keyPath: 'service_tier',
        value: settings.speed === 'fast' ? 'priority' : null,
        mergeStrategy: 'replace',
        filePath: null,
        expectedVersion: null
      })
      .catch((error) => console.error('Failed to persist speed preference:', error))
  }, [isAuthenticated, settings.speed])

  useEffect(() => {
    const cleanup = window.codex.onEvent((event) => {
      const { method, params, requestId } = event
      const p = params as EventPayload

      // Read latest state directly from the store to avoid stale closures.
      // React useState updates are asynchronous, so values captured in the
      // effect closure can be outdated when events arrive in rapid succession
      // (e.g. reasoning deltas immediately after turn/started).
      const {
        activeThreadId,
        activeTab,
        activeTurnId,
        activeTurnThreadId,
        streamingThreadId,
        threads: currentThreads
      } = useCodexStore.getState()

      const markUnreadIfHidden = (threadId: string): void => {
        const isVisible = activeTab === 'threads' && activeThreadId === threadId
        if (!isVisible) {
          markThreadUnread(threadId, true)
        }
      }

      switch (method) {
        case 'turn/started':
        case 'turn.started': {
          const turnId = getTurnIdFromParams(p)
          const nextThreadId = resolveThreadIdForEvent(p, {
            threads: currentThreads,
            activeTurnId,
            activeTurnThreadId,
            streamingThreadId
          })
          if (!nextThreadId) break
          setStreamingThread(nextThreadId)
          if (turnId && nextThreadId) {
            setActiveTurn(nextThreadId, turnId)
          }
          setIsStreaming(true)
          break
        }

        case 'item/agentMessage/delta':
        case 'item/agent_message/delta': {
          const threadId = resolveThreadIdForEvent(p, {
            threads: currentThreads,
            activeTurnId,
            activeTurnThreadId,
            streamingThreadId
          })
          const turnId = getTurnIdFromParams(p)
          if (activeTurnId && turnId && activeTurnId !== turnId) break
          const currentAssistantId = threadId
            ? getAssistantMessageIdForThread(currentThreads, threadId)
            : null
          if (currentAssistantId && threadId) {
            const delta = extractText(p.text) || extractText(p.delta) || ''
            if (!delta) break
            const eventItemId = getString(p.id) || getString(p.itemId)
            if (eventItemId) {
              appendToItemContent(threadId, currentAssistantId, eventItemId, 'agentMessage', delta)
              break
            }

            const thread = currentThreads.find((t) => t.id === threadId)
            const msg = thread?.messages.find((m) => m.id === currentAssistantId)
            const activeAgentItem = msg?.items.find(
              (i) => i.type === 'agentMessage' && !i.completed
            )
            if (activeAgentItem) {
              appendToItemContent(
                threadId,
                currentAssistantId,
                activeAgentItem.id,
                'agentMessage',
                delta
              )
            } else {
              appendToMessage(threadId, currentAssistantId, delta)
            }
          }
          break
        }

        case 'item/started':
        case 'item.started': {
          const threadId = resolveThreadIdForEvent(p, {
            threads: currentThreads,
            activeTurnId,
            activeTurnThreadId,
            streamingThreadId
          })
          const turnId = getTurnIdFromParams(p)
          if (activeTurnId && turnId && activeTurnId !== turnId) break
          const currentAssistantId = threadId
            ? getAssistantMessageIdForThread(currentThreads, threadId)
            : null
          if (currentAssistantId && threadId) {
            const eventItem = getEventItem(p)
            if (isSkippableItem(eventItem)) break
            addItemToMessage(threadId, currentAssistantId, buildMessageItem(eventItem))
          }
          break
        }

        case 'item/completed':
        case 'item.completed': {
          const threadId = resolveThreadIdForEvent(p, {
            threads: currentThreads,
            activeTurnId,
            activeTurnThreadId,
            streamingThreadId
          })
          const turnId = getTurnIdFromParams(p)
          if (activeTurnId && turnId && activeTurnId !== turnId) break
          const currentAssistantId = threadId
            ? getAssistantMessageIdForThread(currentThreads, threadId)
            : null
          if (currentAssistantId && threadId) {
            const eventItem = getEventItem(p)
            if (isSkippableItem(eventItem)) break
            const itemId =
              getString(eventItem.id) || getString(eventItem.itemId) || getString(p.itemId)
            if (itemId) {
              const thread = currentThreads.find((t) => t.id === threadId)
              const msg = thread?.messages.find((m) => m.id === currentAssistantId)
              const existingItem = msg?.items.find((i) => i.id === itemId)
              const nextUpdates = buildItemUpdates(eventItem)

              const type =
                nextUpdates.type && nextUpdates.type !== 'unknown'
                  ? nextUpdates.type
                  : existingItem?.type || nextUpdates.type
              const content = choosePreferredText(existingItem?.content, nextUpdates.content)
              const output = choosePreferredText(existingItem?.output, nextUpdates.output)
              const summary = choosePreferredText(existingItem?.summary, nextUpdates.summary)

              updateItem(threadId, currentAssistantId, itemId, {
                ...nextUpdates,
                type,
                content,
                output,
                summary,
                completed: true
              })
            }
          }
          break
        }

        case 'item/commandExecution/outputDelta':
        case 'item/command_execution/output_delta': {
          const threadId = resolveThreadIdForEvent(p, {
            threads: currentThreads,
            activeTurnId,
            activeTurnThreadId,
            streamingThreadId
          })
          const turnId = getTurnIdFromParams(p)
          if (activeTurnId && turnId && activeTurnId !== turnId) break
          const currentAssistantId = threadId
            ? getAssistantMessageIdForThread(currentThreads, threadId)
            : null
          if (currentAssistantId && threadId) {
            const itemId = getString(p.id) || getString(p.itemId)
            const delta = getString(p.output) || getString(p.delta) || ''
            if (itemId && delta) {
              appendToItemOutput(threadId, currentAssistantId, itemId, delta)
            }
          }
          break
        }

        case 'item/fileChange/outputDelta':
        case 'item/file_change/output_delta': {
          const threadId = resolveThreadIdForEvent(p, {
            threads: currentThreads,
            activeTurnId,
            activeTurnThreadId,
            streamingThreadId
          })
          const turnId = getTurnIdFromParams(p)
          if (activeTurnId && turnId && activeTurnId !== turnId) break
          const currentAssistantId = threadId
            ? getAssistantMessageIdForThread(currentThreads, threadId)
            : null
          if (currentAssistantId && threadId) {
            const itemId = getString(p.id) || getString(p.itemId)
            const delta = getString(p.output) || getString(p.delta) || ''
            if (itemId && delta) {
              appendToItemOutput(threadId, currentAssistantId, itemId, delta)
            }
          }
          break
        }

        case 'item/plan/delta':
        case 'item/plan.delta': {
          const threadId = resolveThreadIdForEvent(p, {
            threads: currentThreads,
            activeTurnId,
            activeTurnThreadId,
            streamingThreadId
          })
          const turnId = getTurnIdFromParams(p)
          if (activeTurnId && turnId && activeTurnId !== turnId) break
          const currentAssistantId = threadId
            ? getAssistantMessageIdForThread(currentThreads, threadId)
            : null
          if (currentAssistantId && threadId) {
            const itemId = getString(p.id) || getString(p.itemId)
            const delta = extractText(p.text) || extractText(p.delta) || ''
            if (!itemId || !delta) break

            appendToItemContent(threadId, currentAssistantId, itemId, 'plan', delta)
          }
          break
        }

        case 'item/reasoning/summaryTextDelta':
        case 'item/reasoning/summary_text_delta':
        case 'item/reasoning/textDelta':
        case 'item/reasoning/text_delta': {
          const threadId = resolveThreadIdForEvent(p, {
            threads: currentThreads,
            activeTurnId,
            activeTurnThreadId,
            streamingThreadId
          })
          const turnId = getTurnIdFromParams(p)
          if (activeTurnId && turnId && activeTurnId !== turnId) break
          const currentAssistantId = threadId
            ? getAssistantMessageIdForThread(currentThreads, threadId)
            : null
          if (currentAssistantId && threadId) {
            const itemId = getString(p.id) || getString(p.itemId)
            const delta =
              extractText(p.summaryText) || extractText(p.text) || extractText(p.delta) || ''
            if (!itemId || !delta) break

            appendToItemContent(threadId, currentAssistantId, itemId, 'reasoning', delta)
          }
          break
        }

        case 'item/reasoning/summaryPartAdded':
        case 'item/reasoning/summary_part_added': {
          const threadId = resolveThreadIdForEvent(p, {
            threads: currentThreads,
            activeTurnId,
            activeTurnThreadId,
            streamingThreadId
          })
          const turnId = getTurnIdFromParams(p)
          if (activeTurnId && turnId && activeTurnId !== turnId) break
          const currentAssistantId = threadId
            ? getAssistantMessageIdForThread(currentThreads, threadId)
            : null
          if (currentAssistantId && threadId) {
            const itemId = getString(p.id) || getString(p.itemId)
            if (!itemId) break
            appendToItemContent(threadId, currentAssistantId, itemId, 'reasoning', '\n\n')
          }
          break
        }

        case 'item/commandExecution/requestApproval':
        case 'item/command_execution/request_approval':
        case 'item/fileChange/requestApproval':
        case 'item/file_change/request_approval': {
          const threadId = resolveThreadIdForEvent(p, {
            threads: currentThreads,
            activeTurnId,
            activeTurnThreadId,
            streamingThreadId
          })
          if (!threadId) break
          const isFileChangeApproval =
            method === 'item/fileChange/requestApproval' ||
            method === 'item/file_change/request_approval'
          const reason = extractText(p.reason)
          setApprovalRequest({
            id: getString(p.itemId) || getString(p.id) || '',
            threadId,
            kind: isFileChangeApproval ? 'fileChange' : 'command',
            title: isFileChangeApproval ? 'File Change Approval' : 'Command Approval',
            description: isFileChangeApproval
              ? 'Codex wants to apply pending file changes before continuing.'
              : 'Codex wants to run the following command:',
            details: isFileChangeApproval ? reason : getString(p.command) || reason || '',
            requestId
          })
          break
        }

        case 'turn/completed':
        case 'turn.completed': {
          const threadId = resolveThreadIdForEvent(p, {
            threads: currentThreads,
            activeTurnId,
            activeTurnThreadId,
            streamingThreadId
          })
          const turnId = getTurnIdFromParams(p)
          if (activeTurnId && turnId && activeTurnId !== turnId) break

          const currentAssistantId = threadId
            ? getAssistantMessageIdForThread(currentThreads, threadId)
            : null
          if (currentAssistantId && threadId) {
            const turnStatus = getTurnStatusFromParams(p)
            const failureText = turnStatus === 'failed' ? getErrorMessageFromParams(p) : null
            const thread = currentThreads.find((t) => t.id === threadId)
            const assistantMessage = thread?.messages.find((m) => m.id === currentAssistantId)
            const shouldAddStoppedFallback =
              turnStatus === 'interrupted' &&
              assistantMessage != null &&
              !assistantMessage.content.trim() &&
              assistantMessage.items.length === 0

            finalizeAssistantMessage(threadId, currentAssistantId, {
              fallbackContent: shouldAddStoppedFallback ? 'Stopped.' : undefined,
              itemStatus: turnStatus
            })
            if (failureText) {
              addStatusItemToAssistant(
                threadId,
                currentAssistantId,
                `turn-error:${turnId || threadId}`,
                failureText
              )
            }
            markUnreadIfHidden(threadId)
          }
          if (threadId) {
            void syncThreadTitleFromServer(threadId)
          }
          setIsStreaming(false)
          setStreamingThread(null)
          clearActiveTurn()
          setApprovalRequest(null)
          break
        }

        case 'server/error':
        case 'server/stopped': {
          const threadId =
            activeTurnThreadId || streamingThreadId || getStreamingThreadId(currentThreads)
          const currentAssistantId = threadId
            ? getAssistantMessageIdForThread(currentThreads, threadId)
            : null

          if (threadId && currentAssistantId) {
            const detail =
              method === 'server/error'
                ? getString(p.message)
                : `Codex app-server exited${
                    typeof p.code === 'number' ? ` with code ${p.code}` : ''
                  } before the turn finished.`
            if (detail) {
              addStatusItemToAssistant(
                threadId,
                currentAssistantId,
                `server-stop:${threadId}`,
                detail
              )
            }
            finalizeAssistantMessage(threadId, currentAssistantId, { itemStatus: 'failed' })
            markUnreadIfHidden(threadId)
          }

          setIsStreaming(false)
          setStreamingThread(null)
          clearActiveTurn()
          setApprovalRequest(null)
          break
        }

        case 'auth/expired': {
          setIsStreaming(false)
          setStreamingThread(null)
          clearActiveTurn()
          setApprovalRequest(null)
          setAuthenticated(false)
          break
        }

        case 'thread/remapped': {
          const fromThreadId = p.fromThreadId as string | undefined
          const toThreadId = p.toThreadId as string | undefined
          if (fromThreadId && toThreadId) {
            remapThreadId(fromThreadId, toThreadId)
            void syncThreadTitleFromServer(toThreadId)
          }
          break
        }
      }
    })

    return cleanup
  }, [
    setIsStreaming,
    appendToMessage,
    addItemToMessage,
    appendToItemContent,
    updateItem,
    completeMessageItems,
    appendToItemOutput,
    updateMessage,
    markThreadUnread,
    setStreamingThread,
    setActiveTurn,
    clearActiveTurn,
    setApprovalRequest,
    setAuthenticated,
    remapThreadId,
    syncThreadTitleFromServer,
    addStatusItemToAssistant,
    finalizeAssistantMessage
  ])

  const handleLogin = async (): Promise<void> => {
    await window.codex.login()
    const auth = await window.codex.isAuthenticated()
    setAuthenticated(auth)
    if (auth) {
      await window.codex.startServer()
    }
  }

  const handleApprove = (): void => {
    if (!approvalRequest) return

    void (async () => {
      try {
        if (approvalRequest.requestId != null) {
          await window.codex.resolveServerRequest({
            requestId: approvalRequest.requestId,
            result: { decision: 'accept' }
          })
        } else if (approvalRequest.kind === 'command') {
          await window.codex.approveCommand({ itemId: approvalRequest.id })
        }
      } catch (error) {
        console.error('Failed to approve Codex request:', error)
      } finally {
        setApprovalRequest(null)
      }
    })()
  }

  const handleReject = (): void => {
    if (!approvalRequest) return

    void (async () => {
      try {
        if (approvalRequest.requestId != null) {
          await window.codex.resolveServerRequest({
            requestId: approvalRequest.requestId,
            result: { decision: 'decline' }
          })
        } else if (approvalRequest.kind === 'command') {
          await window.codex.rejectCommand({ itemId: approvalRequest.id })
        }
      } catch (error) {
        console.error('Failed to reject Codex request:', error)
      } finally {
        setApprovalRequest(null)
      }
    })()
  }

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />
  }

  const isSettingsTab = activeTab === 'settings'

  return (
    <div className="relative h-screen overflow-hidden">
      <div className="absolute inset-x-0 top-0 z-50 h-5 drag-region select-none" />

      {isSettingsTab ? (
        <SettingsTab />
      ) : (
        <div className="flex h-screen">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0 bg-background">
            <Header />
            {activeTab === 'skills' ? <SkillsTab /> : <Chat />}
          </div>
        </div>
      )}

      {approvalRequest && (
        <ApprovalDialog
          title={approvalRequest.title}
          description={approvalRequest.description}
          details={approvalRequest.details}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}

      <CommandBar />
    </div>
  )
}
