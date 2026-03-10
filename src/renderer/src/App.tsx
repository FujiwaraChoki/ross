import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import {
  buildPersistedCodexStoreState,
  useCodexStore,
  type AvailableModel,
  type AvailableModelReasoningEffort,
  type CollaborationModeKind,
  type Message,
  type MessageItem,
  type PersistedCodexStoreState,
  type ReasoningEffort,
  type TaskCard,
  type Thread,
  type TurnPlanSnapshot
} from '@/lib/store'
import {
  buildThreadFromHistory,
  normalizeProtocolItem,
  parseAssistantText
} from '@/lib/codex-normalization'
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
import PlanSheet from '@/components/plan-sheet'
import KeyboardShortcuts from '@/components/keyboard-shortcuts'
import { Toaster } from '@/components/ui/sonner'
import {
  applyUiPreferences,
  clampCodeFontSize,
  clampSansFontSize,
  subscribeToSystemThemeChanges,
  UI_CODE_FONT_SIZE_DEFAULT,
  UI_SANS_FONT_SIZE_DEFAULT
} from '@/lib/ui-preferences'
import { DEFAULT_THEME_ID, getThemeFontOverrides } from '../../shared/theme'

type EventPayload = Record<string, unknown>
type ModelListEntry = {
  id: AvailableModel['id']
  name: AvailableModel['name']
  defaultReasoningEffort: AvailableModel['defaultReasoningEffort']
  supportedReasoningEfforts: AvailableModel['supportedReasoningEfforts']
  hidden: boolean
  upgrade: string | undefined
  isDefault: boolean
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function getReasoningEffort(value: unknown): ReasoningEffort | null {
  switch (value) {
    case 'none':
    case 'minimal':
    case 'low':
    case 'medium':
    case 'high':
    case 'xhigh':
      return value
    default:
      return null
  }
}

function normalizeSupportedReasoningEfforts(value: unknown): AvailableModelReasoningEffort[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      const option = asObject(entry)
      const reasoningEffort =
        getReasoningEffort(option?.reasoningEffort) || getReasoningEffort(option?.effort)
      if (!reasoningEffort) return null

      return {
        reasoningEffort,
        description: getString(option?.description) || getString(option?.label) || reasoningEffort
      }
    })
    .filter((entry): entry is AvailableModelReasoningEffort => Boolean(entry))
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

function getItemId(rawItem: EventPayload): string | undefined {
  return (
    getString(rawItem.id) ||
    getString(rawItem.itemId) ||
    getString(rawItem.item_id) ||
    getString(rawItem.callId) ||
    getString(rawItem.call_id)
  )
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

function getCollaborationModeKind(value: unknown): CollaborationModeKind | null {
  return value === 'plan' || value === 'default' ? value : null
}

function getCollaborationModeKindFromParams(params: EventPayload): CollaborationModeKind | null {
  return (
    getCollaborationModeKind(params.collaborationModeKind) ||
    getCollaborationModeKind(params.collaboration_mode_kind) ||
    getCollaborationModeKind(asObject(params.turn)?.collaborationModeKind) ||
    getCollaborationModeKind(asObject(params.turn)?.collaboration_mode_kind) ||
    null
  )
}

function normalizeTurnPlanSnapshot(params: EventPayload): TurnPlanSnapshot | null {
  const rawPlan = Array.isArray(params.plan) ? params.plan : []
  const plan = rawPlan
    .map((entry) => {
      const step = asObject(entry)
      const text = getString(step?.step)
      if (!text) return null

      const rawStatus = getString(step?.status)
      return {
        step: text,
        status:
          rawStatus === 'completed'
            ? 'completed'
            : rawStatus === 'inProgress' || rawStatus === 'in_progress'
              ? 'inProgress'
              : 'pending'
      }
    })
    .filter((entry): entry is TurnPlanSnapshot['plan'][number] => Boolean(entry))

  if (plan.length === 0 && !getString(params.explanation)) return null

  return {
    explanation: getString(params.explanation) || null,
    plan
  }
}

function getLatestUserPrompt(thread: Thread | undefined): string {
  return thread?.messages.findLast((message) => message.role === 'user')?.content.trim() || ''
}

function getAssistantMarkdown(message: Message | undefined): string {
  if (!message) return ''

  const itemMarkdown = message.items
    .filter((item) => item.type === 'agentMessage' && item.content.trim())
    .map((item) => item.content.trim())

  if (itemMarkdown.length > 0) {
    return itemMarkdown.join('\n\n').trim()
  }

  return message.content.trim()
}

function getPlanMarkdown(message: Message | undefined): string {
  if (!message) return ''

  return message.items
    .filter((item) => item.type === 'plan' && item.content.trim())
    .map((item) => item.content.trim())
    .join('\n\n')
    .trim()
}

function buildPlanDocument(params: {
  thread: Thread
  assistantMessage: Message
  turnPlan: TurnPlanSnapshot | null
}): { title: string; content: string } | null {
  const title = normalizeThreadTitleCandidate(params.thread.title) || 'Implementation plan'
  const prompt = getLatestUserPrompt(params.thread)
  const assistantMarkdown = getAssistantMarkdown(params.assistantMessage)
  const planMarkdown = getPlanMarkdown(params.assistantMessage)
  const outline = params.turnPlan?.plan ?? []

  if (!assistantMarkdown && !planMarkdown && outline.length === 0) {
    return null
  }

  const meta = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'long',
    timeStyle: 'short'
  }).format(Date.now())
  const metaParts = [meta, params.thread.project || null].filter(Boolean)
  const sections = [`# ${title}`]

  if (metaParts.length > 0) {
    sections.push(`_${metaParts.join(' • ')}_`)
  }

  if (prompt) {
    sections.push(`## Request\n\n${prompt}`)
  }

  if (params.turnPlan?.explanation) {
    sections.push(`## Framing\n\n${params.turnPlan.explanation}`)
  }

  if (outline.length > 0) {
    sections.push(
      `## Execution Outline\n\n${outline
        .map((step) => `- [${step.status === 'completed' ? 'x' : ' '}] ${step.step}`)
        .join('\n')}`
    )
  }

  if (assistantMarkdown) {
    sections.push(`## Detailed Plan\n\n${assistantMarkdown}`)
  } else if (planMarkdown) {
    sections.push(`## Detailed Plan\n\n${planMarkdown}`)
  }

  return {
    title,
    content: sections.join('\n\n').trim()
  }
}

function logPlanLifecycle(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.log('[plan][ui]', message, details)
    return
  }

  console.log('[plan][ui]', message)
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
    case 'toolCall':
    case 'tool_call':
    case 'function_call':
    case 'function_call_output':
    case 'custom_tool_call':
    case 'custom_tool_call_output':
      return 'toolCall'
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
    case 'web_search_call':
      return 'webSearch'
    case 'imageView':
    case 'image_view':
      return 'imageView'
    case 'contextCompaction':
    case 'context_compaction':
    case 'context_compacted':
    case 'compacted':
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
    type === 'toolCall' ||
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

function parseJsonLikeValue(value: unknown): unknown {
  if (typeof value !== 'string') return value

  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return value
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function getToolOutput(value: unknown): string | undefined {
  const parsed = parseJsonLikeValue(value)
  if (typeof parsed === 'string') return parsed

  const obj = asObject(parsed)
  if (!obj) return stringifyValue(parsed)

  return (
    getString(obj.output) || getString(asObject(obj.metadata)?.output) || stringifyValue(parsed)
  )
}

function buildItemUpdates(rawItem: EventPayload): Partial<MessageItem> {
  const rawType = getString(rawItem.type)
  const type = normalizeItemType(getString(rawItem.type))
  const changes = Array.isArray(rawItem.changes) ? rawItem.changes : []
  const firstChange = asObject(changes[0])
  const action = asObject(rawItem.action)
  const target = asObject(rawItem.target)
  const structuredOutput = parseJsonLikeValue(rawItem.output)

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
    rawType,
    content,
    phase: getString(rawItem.phase),
    status: getString(rawItem.status),
    command: getString(rawItem.command),
    cwd: getString(rawItem.cwd),
    output:
      (type === 'toolCall' ? getToolOutput(rawItem.output) : undefined) ||
      getString(rawItem.aggregatedOutput) ||
      getString(rawItem.output) ||
      (type === 'commandExecution' ? getString(rawItem.content) : undefined),
    filePath: getString(firstChange?.path) || getString(rawItem.filePath),
    changeType: getString(firstChange?.kind) || getString(rawItem.changeType),
    toolName: getString(rawItem.tool) || getString(rawItem.name),
    server: getString(rawItem.server),
    callId: getString(rawItem.callId) || getString(rawItem.call_id),
    argumentsText: stringifyValue(rawItem.arguments ?? rawItem.input),
    resultText:
      stringifyValue(rawItem.result) ||
      (type === 'toolCall' && typeof structuredOutput !== 'string'
        ? stringifyValue(structuredOutput)
        : undefined),
    query:
      getString(rawItem.query) ||
      getString(action?.query) ||
      getString(action?.url) ||
      getString(action?.pattern) ||
      extractText(action?.queries),
    actionType: getString(action?.type) || getString(target?.type),
    actionTarget:
      getString(action?.query) ||
      getString(action?.url) ||
      getString(action?.pattern) ||
      getString(target?.label) ||
      getString(target?.type) ||
      getString(rawItem.user_facing_hint) ||
      undefined,
    summary: extractText(rawItem.summary) || getString(rawItem.user_facing_hint)
  }
}

function buildMessageItem(rawItem: EventPayload): MessageItem {
  const id = getItemId(rawItem) || crypto.randomUUID()
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

function normalizeModelList(result: unknown): ModelListEntry[] {
  const payload = asObject(result)
  const rawModels = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : []

  return rawModels
    .map((entry) => {
      const model = asObject(entry)
      if (!model) return null

      const id = getString(model.id) || getString(model.model)
      if (!id) return null

      return {
        id,
        name: getString(model.displayName) || getString(model.name) || getString(model.model) || id,
        defaultReasoningEffort:
          getReasoningEffort(model.defaultReasoningEffort) ||
          getReasoningEffort(model.default_reasoning_level),
        supportedReasoningEfforts: normalizeSupportedReasoningEfforts(
          model.supportedReasoningEfforts || model.supported_reasoning_levels
        ),
        hidden: model.hidden === true,
        upgrade: getString(model.upgrade),
        isDefault: model.isDefault === true
      }
    })
    .filter((entry): entry is ModelListEntry => Boolean(entry))
}

function getVisibleModelList(models: ModelListEntry[]): ModelListEntry[] {
  const nonHiddenModels = models.filter((model) => !model.hidden)
  const currentModels = nonHiddenModels.filter((model) => !model.upgrade)

  return currentModels.length > 0 ? currentModels : nonHiddenModels
}

function getPreferredModelId(models: ModelListEntry[], currentModel: string): string | null {
  if (models.some((model) => model.id === currentModel)) {
    return currentModel
  }

  return models.find((model) => model.isDefault)?.id || models[0]?.id || null
}

export default function App(): ReactElement {
  const {
    activeThreadId,
    isAuthenticated,
    setAuthenticated,
    setServerReady,
    setAvailableModels,
    setModel,
    model,
    reasoningEffort,
    autonomyLevel,
    threads,
    tasksByThreadId,
    setIsStreaming,
    approvalRequest,
    setApprovalRequest,
    remapThreadId,
    markThreadUnread,
    setStreamingThread,
    setActiveTurn,
    setActiveTurnPlan,
    clearActiveTurn,
    activeTab,
    setActiveTab,
    activeProject,
    recentProjects,
    createThread,
    updateThreadTitle,
    updateMessage,
    appendToMessage,
    addItemToMessage,
    replaceMessageItems,
    appendToItemContent,
    updateItem,
    completeMessageItems,
    appendToItemOutput,
    replaceThreads,
    replaceTasksByThread,
    upsertTask,
    setPlanSheetOpen,
    setSelectedPlanPath,
    planModeEnabled,
    hydrateFromPersistedState,
    setThemes,
    updateSettings,
    themes,
    settings,
    isStreaming
  } = useCodexStore()

  const hasAppliedInitialSpeedPreferenceRef = useRef(false)
  const lastPersistedAppStateRef = useRef<string | null>(null)
  const appStateSaveTimeoutRef = useRef<number | null>(null)
  const [appStateReady, setAppStateReady] = useState(false)
  const [themeCatalogReady, setThemeCatalogReady] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const { isSidebarOpen, setIsSidebarOpen } = useCodexStore()
  const selectedTheme = themes.find((theme) => theme.id === settings.themeId)

  const adjustFontSizes = useCallback(
    (delta: number): void => {
      if (delta === 0) {
        updateSettings({
          sansFontSize: UI_SANS_FONT_SIZE_DEFAULT,
          codeFontSize: UI_CODE_FONT_SIZE_DEFAULT
        })
        return
      }

      updateSettings({
        sansFontSize: clampSansFontSize(settings.sansFontSize + delta),
        codeFontSize: clampCodeFontSize(settings.codeFontSize + delta)
      })
    },
    [settings.codeFontSize, settings.sansFontSize, updateSettings]
  )

  // Wire up Cmd+/- font size shortcuts from the main process
  useEffect(() => {
    return window.codex.onFontSizeShortcut(({ delta }) => adjustFontSizes(delta))
  }, [adjustFontSizes])

  const loadModels = useCallback(async (): Promise<void> => {
    try {
      const normalizedModels = normalizeModelList(await window.codex.modelList())
      const visibleModels = getVisibleModelList(normalizedModels)
      if (visibleModels.length === 0) return

      setAvailableModels(
        visibleModels.map(({ id, name, defaultReasoningEffort, supportedReasoningEfforts }) => ({
          id,
          name,
          defaultReasoningEffort,
          supportedReasoningEfforts
        }))
      )

      const preferredModelId = getPreferredModelId(visibleModels, useCodexStore.getState().model)
      if (preferredModelId && preferredModelId !== useCodexStore.getState().model) {
        setModel(preferredModelId)
      }
    } catch (error) {
      console.error('Failed to load model catalog:', error)
    }
  }, [setAvailableModels, setModel])

  const loadThemes = useCallback(async (): Promise<void> => {
    try {
      const result = await window.codex.listThemes()
      setThemes(result.themes)

      const currentSettings = useCodexStore.getState().settings
      if (!result.themes.some((theme) => theme.id === currentSettings.themeId)) {
        const fallbackTheme = result.themes.find((theme) => theme.id === DEFAULT_THEME_ID)
        useCodexStore.getState().updateSettings({
          themeId: DEFAULT_THEME_ID,
          ...getThemeFontOverrides(fallbackTheme)
        })
      }
    } catch (error) {
      console.error('Failed to load theme catalog:', error)
    } finally {
      setThemeCatalogReady(true)
    }
  }, [setThemes])

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

  const hydrateThreadsFromServer = useCallback(async (): Promise<void> => {
    try {
      const listResult = await window.codex.threadList({})
      const listPayload = asObject(listResult)
      const rawThreads = Array.isArray(listPayload?.threads)
        ? listPayload.threads
        : Array.isArray(listPayload?.data)
          ? listPayload.data
          : []
      const persistedThreads = useCodexStore.getState().threads
      const persistedTaskMap = useCodexStore.getState().tasksByThreadId

      const threadHeaders = rawThreads
        .map((entry) => asObject(entry))
        .filter((entry): entry is EventPayload => Boolean(entry))
        .sort((left, right) => {
          const leftUpdated = typeof left.updatedAt === 'number' ? left.updatedAt : 0
          const rightUpdated = typeof right.updatedAt === 'number' ? right.updatedAt : 0
          return rightUpdated - leftUpdated
        })

      if (threadHeaders.length === 0) return

      const placeholderThreads: Thread[] = threadHeaders.map((rawThread) => {
        const threadId = getString(rawThread.id) || crypto.randomUUID()
        const persisted = persistedThreads.find((entry) => entry.id === threadId)
        const projectPath = getString(rawThread.cwd) || persisted?.projectPath
        return {
          id: threadId,
          title:
            getString(rawThread.name) ||
            getString(rawThread.preview) ||
            persisted?.title ||
            'New Thread',
          project: persisted?.project || projectPath?.split('/').pop() || 'local',
          projectPath,
          createdAt:
            typeof rawThread.createdAt === 'number'
              ? rawThread.createdAt * 1000
              : persisted?.createdAt || Date.now(),
          messages: persisted?.messages || [],
          pinned: persisted?.pinned || false,
          unread: persisted?.unread || false,
          archived: persisted?.archived || false
        }
      })

      const activeId = useCodexStore.getState().activeThreadId
      const recentIds = new Set(
        placeholderThreads
          .slice(0, 8)
          .map((thread) => thread.id)
          .concat(activeId ? [activeId] : [])
      )

      const hydratedEntries = await Promise.allSettled(
        [...recentIds].map(async (threadId) => {
          const placeholder = placeholderThreads.find((entry) => entry.id === threadId)
          const result = await window.codex.threadRead({ threadId, includeTurns: true })
          return buildThreadFromHistory(result, placeholder, persistedTaskMap[threadId] || [])
        })
      )

      const hydratedThreads = new Map<string, Thread>()
      const nextTasksByThread = { ...persistedTaskMap }

      hydratedEntries.forEach((entry) => {
        if (entry.status !== 'fulfilled') return
        if (entry.value.thread) {
          hydratedThreads.set(entry.value.thread.id, entry.value.thread)
          nextTasksByThread[entry.value.thread.id] = entry.value.tasks
        }
      })

      replaceThreads(placeholderThreads.map((thread) => hydratedThreads.get(thread.id) || thread))
      replaceTasksByThread(nextTasksByThread)
    } catch (error) {
      console.error('Failed to hydrate threads from server:', error)
    }
  }, [replaceTasksByThread, replaceThreads])

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

  const postProcessAssistantMessage = useCallback(
    (threadId: string, messageId: string): void => {
      const thread = useCodexStore.getState().threads.find((entry) => entry.id === threadId)
      const message = thread?.messages.find((entry) => entry.id === messageId)
      if (!message) return

      const nextItems: MessageItem[] = []
      let changed = false

      message.items.forEach((item) => {
        if (item.type !== 'agentMessage' || !item.content.includes('::')) {
          nextItems.push(item)
          return
        }

        const parsed = parseAssistantText(item.content)
        if (parsed.directives.length === 0) {
          nextItems.push(item)
          return
        }

        changed = true
        if (parsed.text) {
          nextItems.push({
            ...item,
            content: parsed.text
          })
        }

        parsed.directives.forEach((directive, index) => {
          nextItems.push({
            id: `${item.id}:directive:${index}`,
            type: 'directive',
            rawType: item.rawType || 'message',
            rawFamily: item.rawFamily || 'history',
            semanticCategory: 'directive',
            phase: item.phase,
            content: directive.source,
            directive,
            completed: true
          })
        })
      })

      if (!changed) return

      replaceMessageItems(threadId, messageId, nextItems)
      updateMessage(threadId, messageId, {
        content: nextItems
          .filter((item) => item.type === 'agentMessage')
          .map((item) => item.content)
          .filter(Boolean)
          .join('\n\n')
          .trim()
      })
    },
    [replaceMessageItems, updateMessage]
  )

  const applyTaskUpdatesToThread = useCallback(
    (threadId: string, updates: TaskCard[]): void => {
      if (updates.length === 0) return

      updates.forEach((task) => {
        const existingTasks = useCodexStore.getState().tasksByThreadId[threadId] || []
        const normalizedTask = { ...task, threadId }
        const directMatch =
          existingTasks.find((entry) => entry.id === normalizedTask.id) ||
          (normalizedTask.agentId
            ? existingTasks.find((entry) => entry.agentId === normalizedTask.agentId)
            : undefined) ||
          (normalizedTask.turnId
            ? existingTasks.find((entry) => entry.turnId === normalizedTask.turnId)
            : undefined)

        const pendingTasks = existingTasks.filter((entry) =>
          ['queued', 'running', 'waiting'].includes(entry.status)
        )
        const heuristicMatch =
          directMatch ||
          (!normalizedTask.agentId &&
          normalizedTask.turnId &&
          pendingTasks.length === 1 &&
          ['running', 'completed', 'failed'].includes(normalizedTask.status)
            ? pendingTasks[0]
            : undefined)

        upsertTask(threadId, {
          ...(heuristicMatch || {}),
          ...normalizedTask,
          id: heuristicMatch?.id || normalizedTask.id,
          threadId,
          title: normalizedTask.title || heuristicMatch?.title || 'Background task',
          linkedCallIds: [
            ...new Set([
              ...(heuristicMatch?.linkedCallIds || []),
              ...(normalizedTask.linkedCallIds || [])
            ])
          ],
          linkedTranscriptItemIds: [
            ...new Set([
              ...(heuristicMatch?.linkedTranscriptItemIds || []),
              ...(normalizedTask.linkedTranscriptItemIds || [])
            ])
          ],
          results: [
            ...new Set([...(heuristicMatch?.results || []), ...(normalizedTask.results || [])])
          ]
        })
      })
    },
    [upsertTask]
  )

  const persistPlanDocument = useCallback(
    async (params: {
      thread: Thread
      assistantMessage: Message
      turnPlan: TurnPlanSnapshot | null
    }): Promise<void> => {
      const planDocument = buildPlanDocument(params)
      if (!planDocument) {
        logPlanLifecycle('Skipped plan persistence because no plan document could be built', {
          threadId: params.thread.id,
          assistantTextLength: getAssistantMarkdown(params.assistantMessage).length,
          planTextLength: getPlanMarkdown(params.assistantMessage).length,
          outlineSteps: params.turnPlan?.plan.length || 0
        })
        return
      }

      logPlanLifecycle('Persisting plan document', {
        threadId: params.thread.id,
        title: planDocument.title,
        characters: planDocument.content.length
      })

      try {
        const savedPlan = await window.codex.savePlan(planDocument)
        logPlanLifecycle('Plan document persisted', {
          threadId: params.thread.id,
          path: savedPlan.path,
          bytes: savedPlan.size
        })
        setSelectedPlanPath(savedPlan.path)
        setPlanSheetOpen(true)
      } catch (error) {
        console.error('Failed to persist plan document:', error)
      }
    },
    [setPlanSheetOpen, setSelectedPlanPath]
  )

  const { setActiveProject } = useCodexStore()

  // Listen for "Open Project" from the native menu bar
  useEffect(() => {
    return window.codex.onOpenProjectResult(({ path, name }) => {
      setActiveProject({ path, name })
    })
  }, [setActiveProject])

  // Cmd/Ctrl shortcuts for app actions.
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
      if (mod && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        const store = useCodexStore.getState()
        store.setPlanModeEnabled(!store.planModeEnabled)
      }
      if (mod && e.key === 'o') {
        e.preventDefault()
        window.codex
          .openProject()
          .then((result) => {
            if (result) {
              const { path, name } = result as { path: string; name: string }
              setActiveProject({ path, name })
            }
          })
          .catch((err) => console.error('Failed to open folder:', err))
      }
      if (mod && e.key === '/') {
        e.preventDefault()
        setShortcutsOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    isSidebarOpen,
    setIsSidebarOpen,
    activeTab,
    setActiveTab,
    activeProject,
    createThread,
    setActiveProject,
    adjustFontSizes
  ])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const storedState = await window.codex.loadAppState()
        if (cancelled) return

        const persistedState = asObject(storedState) as Partial<PersistedCodexStoreState> | null
        if (persistedState) {
          hydrateFromPersistedState(persistedState)
          lastPersistedAppStateRef.current = JSON.stringify(
            buildPersistedCodexStoreState(useCodexStore.getState())
          )
        }
      } catch (error) {
        console.error('Failed to load persisted app state:', error)
      }

      await loadThemes()

      if (cancelled) return
      setAppStateReady(true)

      const auth = await window.codex.isAuthenticated()
      if (cancelled) return

      setAuthenticated(auth)
      if (!auth) return

      try {
        await window.codex.startServer()
        if (!cancelled) {
          setServerReady(true)
          void loadModels()
          await hydrateThreadsFromServer()
          await syncKnownThreadTitlesFromServer()
        }
      } catch (error) {
        console.error(error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    hydrateFromPersistedState,
    hydrateThreadsFromServer,
    loadModels,
    loadThemes,
    setAuthenticated,
    setServerReady,
    syncKnownThreadTitlesFromServer
  ])

  useEffect(() => {
    if (!appStateReady) return

    if (isStreaming) {
      if (appStateSaveTimeoutRef.current) {
        clearTimeout(appStateSaveTimeoutRef.current)
        appStateSaveTimeoutRef.current = null
      }
      return
    }

    const snapshot = buildPersistedCodexStoreState(useCodexStore.getState())
    const serializedSnapshot = JSON.stringify(snapshot)
    if (lastPersistedAppStateRef.current === serializedSnapshot) return

    if (appStateSaveTimeoutRef.current) {
      clearTimeout(appStateSaveTimeoutRef.current)
    }

    appStateSaveTimeoutRef.current = window.setTimeout(() => {
      void window.codex
        .saveAppState(snapshot)
        .then((saved) => {
          if (!saved) return
          lastPersistedAppStateRef.current = serializedSnapshot
        })
        .catch((error) => console.error('Failed to persist app state:', error))
    }, 500)

    return () => {
      if (appStateSaveTimeoutRef.current) {
        clearTimeout(appStateSaveTimeoutRef.current)
        appStateSaveTimeoutRef.current = null
      }
    }
  }, [
    appStateReady,
    activeThreadId,
    activeTab,
    activeProject,
    autonomyLevel,
    isSidebarOpen,
    model,
    planModeEnabled,
    reasoningEffort,
    recentProjects,
    settings,
    isStreaming,
    tasksByThreadId,
    threads
  ])

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
    applyUiPreferences(settings, selectedTheme)
  }, [selectedTheme, settings])

  useEffect(() => {
    if (!themeCatalogReady || themes.length === 0 || selectedTheme) return
    const fallbackTheme = themes.find((theme) => theme.id === DEFAULT_THEME_ID)
    updateSettings({
      themeId: DEFAULT_THEME_ID,
      ...getThemeFontOverrides(fallbackTheme)
    })
  }, [selectedTheme, themeCatalogReady, themes, updateSettings])

  useEffect(() => {
    if (settings.themeMode !== 'system') return

    return subscribeToSystemThemeChanges(() => {
      const store = useCodexStore.getState()
      const currentTheme = store.themes.find((theme) => theme.id === store.settings.themeId)
      applyUiPreferences(store.settings, currentTheme)
    })
  }, [settings.themeId, settings.themeMode, themes])

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
        activeTurnMode,
        activeTurnPlan,
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
          const collaborationModeKind = getCollaborationModeKindFromParams(p)
          const nextThreadId = resolveThreadIdForEvent(p, {
            threads: currentThreads,
            activeTurnId,
            activeTurnThreadId,
            streamingThreadId
          })
          if (!nextThreadId) break
          setStreamingThread(nextThreadId)
          setActiveTurnPlan(null)
          if (turnId && nextThreadId) {
            setActiveTurn(
              nextThreadId,
              turnId,
              collaborationModeKind || activeTurnMode || 'default'
            )
          }
          if (collaborationModeKind === 'plan' || activeTurnMode === 'plan') {
            logPlanLifecycle('Received turn/started for plan-mode turn', {
              threadId: nextThreadId,
              turnId,
              collaborationModeKind,
              activeTurnMode
            })
          }
          setIsStreaming(true)
          break
        }

        case 'turn/plan/updated':
        case 'turn.plan.updated': {
          const turnId = getTurnIdFromParams(p)
          if (activeTurnId && turnId && activeTurnId !== turnId) break
          const snapshot = normalizeTurnPlanSnapshot(p)
          logPlanLifecycle('Received turn/plan update', {
            turnId,
            explanationLength: snapshot?.explanation?.length || 0,
            steps: snapshot?.plan.length || 0
          })
          setActiveTurnPlan(snapshot)
          break
        }

        case 'task_started':
        case 'task_complete': {
          const threadId = resolveThreadIdForEvent(p, {
            threads: currentThreads,
            activeTurnId,
            activeTurnThreadId,
            streamingThreadId
          })
          if (!threadId) break

          const normalized = normalizeProtocolItem(p, {
            rawFamily: 'event_msg'
          })
          applyTaskUpdatesToThread(
            threadId,
            normalized.taskUpdates.map((task) => ({
              ...task,
              linkedTranscriptItemIds: [
                ...new Set([
                  ...(task.linkedTranscriptItemIds || []),
                  ...normalized.transcriptItems.map((item) => item.id)
                ])
              ]
            }))
          )

          const currentAssistantId = getAssistantMessageIdForThread(currentThreads, threadId)
          if (currentAssistantId) {
            normalized.transcriptItems.forEach((item) => {
              addItemToMessage(threadId, currentAssistantId, item)
            })
          }

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
            const normalized = normalizeProtocolItem(eventItem, {
              rawFamily: 'response_item',
              phase: getString(eventItem.phase)
            })
            const nextItem = normalized.transcriptItems[0] || {
              ...buildMessageItem(eventItem),
              rawFamily: 'response_item'
            }
            addItemToMessage(threadId, currentAssistantId, {
              ...nextItem,
              completed: false
            })
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
            const itemId = getItemId(eventItem) || getItemId(p)
            if (itemId) {
              const thread = currentThreads.find((t) => t.id === threadId)
              const msg = thread?.messages.find((m) => m.id === currentAssistantId)
              const existingItem = msg?.items.find((i) => i.id === itemId)
              const enrichedEventItem =
                (getString(eventItem.type) === 'function_call_output' ||
                  getString(eventItem.type) === 'custom_tool_call_output') &&
                existingItem?.toolName
                  ? {
                      ...eventItem,
                      name: existingItem.toolName,
                      tool: existingItem.toolName,
                      server: existingItem.server
                    }
                  : eventItem
              const normalized = normalizeProtocolItem(enrichedEventItem, {
                rawFamily: 'response_item',
                phase: getString(enrichedEventItem.phase)
              })
              const normalizedItem =
                normalized.transcriptItems.find(
                  (item) =>
                    item.id === itemId ||
                    item.callId === itemId ||
                    item.callId === existingItem?.callId
                ) || normalized.transcriptItems[0]
              const nextUpdates = normalizedItem
                ? {
                    ...normalizedItem,
                    content: normalizedItem.content,
                    output: normalizedItem.output,
                    summary: normalizedItem.summary
                  }
                : buildItemUpdates(enrichedEventItem)

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

              applyTaskUpdatesToThread(
                threadId,
                normalized.taskUpdates.map((task) => ({
                  ...task,
                  linkedTranscriptItemIds: [
                    ...new Set([...(task.linkedTranscriptItemIds || []), itemId])
                  ]
                }))
              )
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
            const itemId = getItemId(p)
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
            const itemId = getItemId(p)
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
            const itemId = getItemId(p)
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
            const itemId = getItemId(p)
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
            const itemId = getItemId(p)
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
          const thread = threadId ? currentThreads.find((entry) => entry.id === threadId) : null
          const assistantMessage =
            currentAssistantId && thread
              ? thread.messages.find((message) => message.id === currentAssistantId) || null
              : null
          const shouldPersistPlan =
            activeTurnMode === 'plan' &&
            thread != null &&
            assistantMessage != null &&
            getTurnStatusFromParams(p) !== 'failed'
          const assistantMarkdownLength = getAssistantMarkdown(assistantMessage || undefined).length
          const planMarkdownLength = getPlanMarkdown(assistantMessage || undefined).length
          const outlineSteps = activeTurnPlan?.plan.length || 0

          if (
            activeTurnMode === 'plan' ||
            shouldPersistPlan ||
            planMarkdownLength > 0 ||
            outlineSteps > 0
          ) {
            logPlanLifecycle('Handling turn/completed for plan flow', {
              threadId,
              turnId,
              status: getTurnStatusFromParams(p),
              activeTurnMode,
              shouldPersistPlan,
              assistantMarkdownLength,
              planMarkdownLength,
              outlineSteps,
              hasAssistantMessage: assistantMessage != null
            })
          }

          if (currentAssistantId && threadId) {
            const turnStatus = getTurnStatusFromParams(p)
            const failureText = turnStatus === 'failed' ? getErrorMessageFromParams(p) : null
            const shouldAddStoppedFallback =
              turnStatus === 'interrupted' &&
              assistantMessage != null &&
              !assistantMessage.content.trim() &&
              assistantMessage.items.length === 0

            finalizeAssistantMessage(threadId, currentAssistantId, {
              fallbackContent: shouldAddStoppedFallback ? 'Stopped.' : undefined,
              itemStatus: turnStatus
            })
            postProcessAssistantMessage(threadId, currentAssistantId)
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
          if (shouldPersistPlan && thread && assistantMessage) {
            void persistPlanDocument({
              thread,
              assistantMessage,
              turnPlan: activeTurnPlan
            })
          } else if (activeTurnMode === 'plan') {
            logPlanLifecycle('Skipped plan persistence after turn/completed', {
              threadId,
              turnId,
              status: getTurnStatusFromParams(p),
              reason:
                getTurnStatusFromParams(p) === 'failed'
                  ? 'turn failed'
                  : !thread
                    ? 'thread missing'
                    : !assistantMessage
                      ? 'assistant message missing'
                      : 'shouldPersistPlan was false',
              assistantMarkdownLength,
              planMarkdownLength,
              outlineSteps
            })
          }
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
    setActiveTurnPlan,
    clearActiveTurn,
    setApprovalRequest,
    setAuthenticated,
    remapThreadId,
    syncThreadTitleFromServer,
    applyTaskUpdatesToThread,
    addStatusItemToAssistant,
    finalizeAssistantMessage,
    postProcessAssistantMessage,
    persistPlanDocument
  ])

  const handleLogin = async (): Promise<void> => {
    await window.codex.login()
    const auth = await window.codex.isAuthenticated()
    setAuthenticated(auth)
    if (auth) {
      await window.codex.startServer()
      setServerReady(true)
      await loadModels()
      await hydrateThreadsFromServer()
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
    <div className="relative h-full overflow-hidden">
      <div className="absolute inset-x-0 top-0 z-50 h-5 drag-region select-none" />

      {isSettingsTab ? (
        <SettingsTab />
      ) : (
        <div className="flex h-full min-h-0">
          <AppSidebar />
          <div className="flex min-h-0 flex-1 flex-col min-w-0 overflow-hidden bg-background">
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

      <PlanSheet />
      <CommandBar />
      <KeyboardShortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <Toaster />
    </div>
  )
}
