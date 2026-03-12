import type {
  DirectiveCard,
  DirectiveKind,
  Message,
  MessageAttachment,
  NormalizedCodexEvent,
  TaskCard,
  TaskStatus,
  Thread,
  TranscriptItem
} from '@/lib/store'

type RawObject = Record<string, unknown>

interface ParsedDirectiveMatch {
  directive: DirectiveCard
  start: number
  end: number
}

interface ParsedAssistantText {
  text: string
  directives: DirectiveCard[]
}

interface ThreadBuildState {
  tasksById: Map<string, TaskCard>
  tasksByAgentId: Map<string, string>
  tasksByTurnId: Map<string, string>
}

function mergeMessageItem(existing: TranscriptItem, incoming: TranscriptItem): TranscriptItem {
  return {
    ...existing,
    ...incoming,
    type: incoming.type === 'unknown' ? existing.type : incoming.type,
    content: choosePreferredText(existing.content, incoming.content),
    output: choosePreferredText(existing.output, incoming.output),
    summary: choosePreferredText(existing.summary, incoming.summary)
  }
}

function mergeMessageAttachments(
  existing: MessageAttachment[],
  incoming: MessageAttachment[]
): MessageAttachment[] {
  const merged: MessageAttachment[] = [...existing]

  incoming.forEach((attachment) => {
    const duplicate = merged.some(
      (entry) => entry.id === attachment.id || entry.path === attachment.path
    )
    if (!duplicate) {
      merged.push(attachment)
    }
  })

  return merged
}

function mergeMessageWithPersisted(primary: Message, persisted?: Message): Message {
  if (!persisted) return primary

  const mergedItems = [...primary.items]
  persisted.items.forEach((item) => {
    const existingIndex = mergedItems.findIndex(
      (entry) =>
        entry.id === item.id ||
        (entry.callId != null && item.callId != null && entry.callId === item.callId)
    )

    if (existingIndex === -1) {
      mergedItems.push(item)
      return
    }

    mergedItems[existingIndex] = mergeMessageItem(mergedItems[existingIndex], item)
  })

  return {
    ...primary,
    content: choosePreferredText(primary.content, persisted.content),
    attachments: mergeMessageAttachments(primary.attachments, persisted.attachments),
    items: mergedItems
  }
}

function mergeThreadMessagesWithPersisted(
  messages: Message[],
  persistedMessages: Message[]
): Message[] {
  if (persistedMessages.length === 0) return messages

  const persistedById = new Map(persistedMessages.map((message) => [message.id, message]))
  const persistedByRole = new Map<Message['role'], Message[]>()

  persistedMessages.forEach((message) => {
    const bucket = persistedByRole.get(message.role) || []
    bucket.push(message)
    persistedByRole.set(message.role, bucket)
  })

  const usedPersistedIds = new Set<string>()
  const mergedMessages = messages.map((message) => {
    const directMatch = persistedById.get(message.id)
    const roleBucket = persistedByRole.get(message.role) || []
    const roleMatch = roleBucket.find((entry) => !usedPersistedIds.has(entry.id))
    const persistedMatch = directMatch || roleMatch

    if (!persistedMatch) return message

    usedPersistedIds.add(persistedMatch.id)
    return mergeMessageWithPersisted(message, persistedMatch)
  })

  const unmatchedPersisted = persistedMessages.filter(
    (message) => !usedPersistedIds.has(message.id)
  )
  if (unmatchedPersisted.length === 0) {
    return mergedMessages
  }

  return [...mergedMessages, ...unmatchedPersisted].sort(
    (left, right) => left.timestamp - right.timestamp
  )
}

export function asObject(value: unknown): RawObject | null {
  return typeof value === 'object' && value !== null ? (value as RawObject) : null
}

export function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function extractText(value: unknown, depth = 0): string | undefined {
  if (depth > 5 || value == null) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => extractText(entry, depth + 1))
      .filter((entry): entry is string => Boolean(entry))
    return parts.length > 0 ? parts.join('\n') : undefined
  }

  const obj = asObject(value)
  if (!obj) return undefined

  const priorityKeys = [
    'summaryText',
    'text',
    'delta',
    'content',
    'output',
    'summary',
    'last_agent_message',
    'lastAgentMessage'
  ]
  for (const key of priorityKeys) {
    const text = extractText(obj[key], depth + 1)
    if (text) return text
  }

  return undefined
}

export function stringifyValue(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function parseJsonLikeValue(value: unknown): unknown {
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

export function choosePreferredText(
  existing: string | undefined,
  incoming: string | undefined
): string {
  const current = existing?.trim() ? existing : ''
  const next = incoming?.trim() ? incoming : ''
  if (!current) return next
  if (!next) return current
  if (next === current) return current
  if (next.includes(current)) return next
  if (current.includes(next)) return current
  return next.length >= current.length ? next : current
}

export function getFileChangeDetails(rawItem: RawObject): {
  content: string
  filePath?: string
  changeType?: string
  summary?: string
} {
  const changes = Array.isArray(rawItem.changes)
    ? rawItem.changes
        .map((entry) => asObject(entry))
        .filter((entry): entry is RawObject => Boolean(entry))
    : []

  const changePaths = changes
    .map((entry) => getString(entry.path))
    .filter((entry): entry is string => Boolean(entry))
  const changeKinds = changes
    .map((entry) => getString(entry.kind) || getString(entry.type))
    .filter((entry): entry is string => Boolean(entry))
  const diffParts = changes
    .map((entry) => extractText(entry.diff))
    .filter((entry): entry is string => Boolean(entry))

  const filePath =
    changePaths.length > 1
      ? `${changePaths[0]} +${changePaths.length - 1} more`
      : changePaths[0] || getString(rawItem.path) || getString(rawItem.filePath)

  const changeType =
    changeKinds[0] || getString(rawItem.kind) || getString(rawItem.changeType) || undefined

  const summary =
    changePaths.length > 1
      ? `${changeType === 'create' ? 'Created' : changeType === 'delete' ? 'Deleted' : 'Edited'} ${changePaths.length} files`
      : undefined

  return {
    content:
      diffParts.join('\n\n') ||
      extractText(rawItem.diff) ||
      extractText(rawItem.output) ||
      extractText(rawItem.content) ||
      '',
    filePath,
    changeType,
    summary
  }
}

function normalizeDirectiveKind(rawKind: string): DirectiveKind {
  switch (rawKind) {
    case 'automation-update':
      return 'automationUpdate'
    case 'code-comment':
      return 'codeComment'
    case 'inbox-item':
      return 'inboxItem'
    case 'archive-thread':
      return 'archiveThread'
    case 'archive':
      return 'archive'
    default:
      return 'unknown'
  }
}

function normalizeItemType(rawType: string | undefined): TranscriptItem['type'] {
  switch (rawType) {
    case 'agentMessage':
    case 'agent_message':
    case 'message':
      return 'agentMessage'
    case 'input_text':
      return 'inputText'
    case 'input_image':
    case 'image':
      return 'inputImage'
    case 'commandExecution':
    case 'command_execution':
      return 'commandExecution'
    case 'fileChange':
    case 'file_change':
      return 'fileChange'
    case 'reasoning':
    case 'summary_text':
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
    case 'compaction':
      return 'contextCompaction'
    case 'enteredReviewMode':
    case 'entered_review_mode':
      return 'enteredReviewMode'
    case 'exitedReviewMode':
    case 'exited_review_mode':
      return 'exitedReviewMode'
    case 'task_started':
    case 'task_complete':
      return 'taskStatus'
    default:
      return 'unknown'
  }
}

function isEditToolName(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.toLowerCase()
  return normalized.includes('apply_patch') || normalized.includes('file_change')
}

function getSemanticCategory(type: TranscriptItem['type']): TranscriptItem['semanticCategory'] {
  switch (type) {
    case 'agentMessage':
    case 'inputText':
    case 'inputImage':
      return 'message'
    case 'reasoning':
      return 'reasoning'
    case 'plan':
      return 'plan'
    case 'toolCall':
    case 'mcpToolCall':
    case 'dynamicToolCall':
    case 'collabToolCall':
      return 'tool'
    case 'webSearch':
      return 'web'
    case 'directive':
      return 'directive'
    case 'taskStatus':
      return 'task'
    case 'contextCompaction':
    case 'enteredReviewMode':
    case 'exitedReviewMode':
      return 'state'
    default:
      return 'fallback'
  }
}

function getStableId(rawItem: RawObject): string | undefined {
  return (
    getString(rawItem.id) ||
    getString(rawItem.itemId) ||
    getString(rawItem.item_id) ||
    getString(rawItem.callId) ||
    getString(rawItem.call_id) ||
    getString(rawItem.turn_id) ||
    getString(rawItem.turnId)
  )
}

function getToolOutput(rawItem: RawObject): { output?: string; parsedOutput?: unknown } {
  const rawOutput = rawItem.output ?? rawItem.diff ?? rawItem.data
  const parsed = parseJsonLikeValue(rawOutput)
  if (typeof parsed === 'string') {
    return { output: parsed, parsedOutput: undefined }
  }

  const parsedObject = asObject(parsed)
  if (!parsedObject) {
    return {
      output: stringifyValue(parsed),
      parsedOutput: parsed
    }
  }

  return {
    output: getString(parsedObject.output) || stringifyValue(parsed),
    parsedOutput: parsed
  }
}

function parseDirectiveAttributes(
  rawAttributes: string
): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {}
  const attributePattern =
    /([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*("(?:[^"\\]|\\.)*"|\[[^\]]*\]|[^,\s]+)\s*(?:,|$)/g
  let match: RegExpExecArray | null

  while ((match = attributePattern.exec(rawAttributes)) !== null) {
    const key = match[1]
    const rawValue = match[2]?.trim() ?? ''
    let value: string | number | boolean = rawValue

    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      value = rawValue.slice(1, -1).replace(/\\"/g, '"')
    } else if (rawValue === 'true' || rawValue === 'false') {
      value = rawValue === 'true'
    } else if (/^-?\d+(?:\.\d+)?$/.test(rawValue)) {
      value = Number(rawValue)
    }

    attributes[key] = value
  }

  return attributes
}

function toDirectiveCard(
  rawKind: string,
  source: string,
  rawAttributes: string,
  index: number
): DirectiveCard {
  const kind = normalizeDirectiveKind(rawKind)
  const attributes = parseDirectiveAttributes(rawAttributes)
  const rawCwds = attributes.cwds
  const cwds =
    typeof rawCwds === 'string'
      ? rawCwds.trim().startsWith('[')
        ? (parseJsonLikeValue(rawCwds) as string[] | string) instanceof Array
          ? (parseJsonLikeValue(rawCwds) as string[])
          : rawCwds
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean)
        : rawCwds
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
      : undefined

  return {
    id: `directive:${rawKind}:${index}`,
    kind,
    source,
    title: typeof attributes.title === 'string' ? attributes.title : undefined,
    summary: typeof attributes.summary === 'string' ? attributes.summary : undefined,
    body: typeof attributes.body === 'string' ? attributes.body : undefined,
    filePath:
      typeof attributes.file === 'string'
        ? attributes.file
        : typeof attributes.filePath === 'string'
          ? attributes.filePath
          : undefined,
    status: typeof attributes.status === 'string' ? attributes.status : undefined,
    mode: typeof attributes.mode === 'string' ? attributes.mode : undefined,
    prompt: typeof attributes.prompt === 'string' ? attributes.prompt : undefined,
    name: typeof attributes.name === 'string' ? attributes.name : undefined,
    rrule: typeof attributes.rrule === 'string' ? attributes.rrule : undefined,
    reason: typeof attributes.reason === 'string' ? attributes.reason : undefined,
    cwds,
    start: typeof attributes.start === 'number' ? attributes.start : undefined,
    end: typeof attributes.end === 'number' ? attributes.end : undefined,
    priority: typeof attributes.priority === 'number' ? attributes.priority : undefined,
    confidence: typeof attributes.confidence === 'number' ? attributes.confidence : undefined,
    attributes
  }
}

function findDirectiveMatches(text: string): ParsedDirectiveMatch[] {
  const matches: ParsedDirectiveMatch[] = []
  const directivePattern = /::([a-z-]+)\{((?:"(?:[^"\\]|\\.)*"|[^}"])*)\}/g
  let match: RegExpExecArray | null

  while ((match = directivePattern.exec(text)) !== null) {
    matches.push({
      directive: toDirectiveCard(match[1], match[0], match[2] ?? '', matches.length),
      start: match.index,
      end: match.index + match[0].length
    })
  }

  return matches
}

export function parseAssistantText(text: string): ParsedAssistantText {
  if (!text.trim()) {
    return { text: '', directives: [] }
  }

  const matches = findDirectiveMatches(text)
  if (matches.length === 0) {
    return { text, directives: [] }
  }

  const keptParts: string[] = []
  let cursor = 0
  for (const match of matches) {
    const segment = text.slice(cursor, match.start)
    if (segment) keptParts.push(segment)
    cursor = match.end
  }
  if (cursor < text.length) {
    keptParts.push(text.slice(cursor))
  }

  return {
    text: keptParts
      .join('')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    directives: matches.map((match) => match.directive)
  }
}

function createTranscriptItem(
  base: Partial<TranscriptItem> & Pick<TranscriptItem, 'id' | 'type' | 'content'>
): TranscriptItem {
  return {
    rawType: base.rawType,
    rawFamily: base.rawFamily || 'history',
    semanticCategory: base.semanticCategory || getSemanticCategory(base.type),
    phase: base.phase,
    command: base.command,
    output: base.output,
    parsedOutput: base.parsedOutput,
    filePath: base.filePath,
    changeType: base.changeType,
    phaseLabel: base.phaseLabel,
    status: base.status,
    cwd: base.cwd,
    toolName: base.toolName,
    server: base.server,
    argumentsText: base.argumentsText,
    resultText: base.resultText,
    query: base.query,
    actionType: base.actionType,
    actionTarget: base.actionTarget,
    summary: base.summary,
    callId: base.callId,
    callIds: base.callIds,
    agentId: base.agentId,
    turnId: base.turnId,
    linkedTaskIds: base.linkedTaskIds,
    directive: base.directive,
    id: base.id,
    type: base.type,
    content: base.content,
    completed: base.completed ?? true
  }
}

function createTaskCard(
  partial: Partial<TaskCard> & Pick<TaskCard, 'id' | 'threadId' | 'title'>
): TaskCard {
  return {
    status: partial.status || 'unknown',
    summary: partial.summary,
    startedAt: partial.startedAt,
    completedAt: partial.completedAt,
    agentId: partial.agentId,
    turnId: partial.turnId,
    nickname: partial.nickname,
    lastMessage: partial.lastMessage,
    linkedCallIds: partial.linkedCallIds || [],
    linkedTranscriptItemIds: partial.linkedTranscriptItemIds || [],
    results: partial.results || [],
    rawType: partial.rawType,
    id: partial.id,
    threadId: partial.threadId,
    title: partial.title
  }
}

export function normalizeProtocolItem(
  rawItem: RawObject,
  options?: {
    rawFamily?: NormalizedCodexEvent['rawFamily']
    phase?: string
  }
): NormalizedCodexEvent {
  const rawType = getString(rawItem.type) || 'unknown'
  const baseItemType = normalizeItemType(rawType)
  const toolName = getString(rawItem.tool) || getString(rawItem.name)
  const itemType =
    baseItemType === 'toolCall' && isEditToolName(toolName) ? 'fileChange' : baseItemType
  const rawFamily = options?.rawFamily || 'history'
  const action = asObject(rawItem.action)
  const target = asObject(rawItem.target)
  const { output, parsedOutput } = getToolOutput(rawItem)
  const callId = getString(rawItem.call_id) || getString(rawItem.callId)
  const turnId = getString(rawItem.turn_id) || getString(rawItem.turnId)
  const agentId = getString(rawItem.agent_id) || getString(rawItem.agentId)
  const stableId = getStableId(rawItem) || crypto.randomUUID()
  const fileChange = itemType === 'fileChange' ? getFileChangeDetails(rawItem) : null
  const transcriptItems: TranscriptItem[] = []
  const taskUpdates: TaskCard[] = []

  if (rawType === 'message') {
    const role = getString(rawItem.role)
    const phase = getString(rawItem.phase) || options?.phase
    if (role === 'assistant') {
      const contentParts = Array.isArray(rawItem.content) ? rawItem.content : []
      const textParts = contentParts
        .map((part) => {
          const objectPart = asObject(part)
          if (!objectPart) return null
          const contentType = getString(objectPart.type)
          if (contentType === 'output_text' || contentType === 'text') {
            return getString(objectPart.text) || ''
          }
          return null
        })
        .filter((entry): entry is string => entry != null)

      const parsed = parseAssistantText(textParts.join('\n\n'))
      if (parsed.text) {
        transcriptItems.push(
          createTranscriptItem({
            id: `${stableId}:text`,
            type: 'agentMessage',
            rawType,
            rawFamily,
            phase,
            content: parsed.text
          })
        )
      }
      parsed.directives.forEach((directive, index) => {
        transcriptItems.push(
          createTranscriptItem({
            id: `${stableId}:directive:${index}`,
            type: 'directive',
            rawType,
            rawFamily,
            phase,
            content: directive.source,
            directive
          })
        )
      })

      return {
        id: stableId,
        rawType,
        rawFamily,
        threadId: undefined,
        turnId,
        transcriptItems,
        taskUpdates,
        assistantText: parsed.text,
        rawPayload: rawItem
      }
    }
  }

  if (rawType === 'task_started' || rawType === 'task_complete') {
    const lastMessage =
      extractText(rawItem.last_agent_message) || extractText(rawItem.lastAgentMessage)
    const status: TaskStatus = rawType === 'task_started' ? 'running' : 'completed'
    taskUpdates.push(
      createTaskCard({
        id: turnId || stableId,
        threadId: '',
        title: rawType === 'task_started' ? 'Background task' : 'Task complete',
        rawType,
        status,
        turnId,
        startedAt: rawType === 'task_started' ? Date.now() : undefined,
        completedAt: rawType === 'task_complete' ? Date.now() : undefined,
        lastMessage,
        summary: lastMessage,
        results: lastMessage ? [lastMessage] : []
      })
    )

    transcriptItems.push(
      createTranscriptItem({
        id: `${stableId}:task`,
        type: 'taskStatus',
        rawType,
        rawFamily,
        turnId,
        content:
          rawType === 'task_started' ? 'Background task started' : 'Background task finished',
        summary: lastMessage,
        completed: true
      })
    )
  } else {
    const item = createTranscriptItem({
      id: stableId,
      type: itemType,
      rawType,
      rawFamily,
      phase: options?.phase,
      content:
        itemType === 'reasoning'
          ? extractText(rawItem.summary) ||
            extractText(rawItem.content) ||
            extractText(rawItem.text) ||
            ''
          : itemType === 'fileChange'
            ? fileChange?.content || ''
            : itemType === 'contextCompaction'
              ? getString(rawItem.message) ||
                getString(rawItem.user_facing_hint) ||
                'Context compacted'
              : extractText(rawItem.text) || extractText(rawItem.content) || '',
      status: getString(rawItem.status),
      command: getString(rawItem.command),
      cwd: getString(rawItem.cwd),
      filePath: fileChange?.filePath || getString(rawItem.path) || getString(rawItem.filePath),
      changeType:
        fileChange?.changeType || getString(rawItem.kind) || getString(rawItem.changeType),
      toolName,
      server: getString(rawItem.server),
      callId,
      agentId,
      turnId,
      output:
        itemType === 'toolCall' ||
        itemType === 'fileChange' ||
        itemType === 'mcpToolCall' ||
        itemType === 'dynamicToolCall' ||
        itemType === 'collabToolCall'
          ? output
          : undefined,
      parsedOutput,
      argumentsText: stringifyValue(rawItem.arguments ?? rawItem.input),
      resultText:
        stringifyValue(rawItem.result) ||
        ((itemType === 'toolCall' ||
          itemType === 'mcpToolCall' ||
          itemType === 'dynamicToolCall' ||
          itemType === 'collabToolCall' ||
          itemType === 'webSearch' ||
          itemType === 'imageView' ||
          itemType === 'fileChange') &&
        typeof parsedOutput !== 'string'
          ? stringifyValue(parsedOutput)
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
        getString(rawItem.user_facing_hint),
      summary:
        extractText(rawItem.summary) ||
        getString(rawItem.user_facing_hint) ||
        fileChange?.summary ||
        getString(rawItem.phase) ||
        undefined,
      completed: true
    })

    transcriptItems.push(item)

    const normalizedToolName = item.toolName
    const parsedOutputObject = asObject(parsedOutput)
    if (normalizedToolName === 'spawn_agent' && parsedOutputObject && item.callId) {
      const taskId =
        getString(parsedOutputObject.agent_id) || getString(parsedOutputObject.id) || item.callId
      const nickname = getString(parsedOutputObject.nickname)
      taskUpdates.push(
        createTaskCard({
          id: taskId,
          threadId: '',
          title: nickname ? `Agent ${nickname}` : 'Background agent',
          rawType,
          status: 'queued',
          agentId: taskId,
          nickname,
          linkedCallIds: [item.callId],
          linkedTranscriptItemIds: [item.id]
        })
      )
      item.linkedTaskIds = [taskId]
      item.summary = nickname ? `Spawned ${nickname}` : 'Spawned background agent'
    }

    if (normalizedToolName === 'wait' && item.callId) {
      const waitArguments = asObject(parseJsonLikeValue(item.argumentsText))
      const ids = Array.isArray(waitArguments?.ids)
        ? waitArguments.ids.filter((entry): entry is string => typeof entry === 'string')
        : []
      item.linkedTaskIds = ids
      item.summary =
        ids.length > 0 ? `Waiting on ${ids.length} task${ids.length === 1 ? '' : 's'}` : 'Waiting'

      ids.forEach((id) => {
        taskUpdates.push(
          createTaskCard({
            id,
            threadId: '',
            title: 'Background agent',
            rawType,
            status: 'waiting',
            agentId: id,
            linkedCallIds: [item.callId!],
            linkedTranscriptItemIds: [item.id]
          })
        )
      })

      const statusMap = asObject(parsedOutputObject?.status)
      if (statusMap) {
        Object.entries(statusMap).forEach(([id, statusValue]) => {
          const entry = asObject(statusValue)
          const completedText =
            getString(entry?.completed) || getString(entry?.failed) || extractText(statusValue)
          taskUpdates.push(
            createTaskCard({
              id,
              threadId: '',
              title: 'Background agent',
              rawType,
              status: getString(entry?.failed) ? 'failed' : 'completed',
              agentId: id,
              summary: completedText,
              lastMessage: completedText,
              results: completedText ? [completedText] : [],
              linkedCallIds: [item.callId!],
              linkedTranscriptItemIds: [item.id]
            })
          )
        })
      }
    }
  }

  return {
    id: stableId,
    rawType,
    rawFamily,
    threadId: undefined,
    turnId,
    transcriptItems,
    taskUpdates,
    assistantText:
      transcriptItems.find((item) => item.type === 'agentMessage' && item.content.trim())
        ?.content || undefined,
    rawPayload: rawItem
  }
}

function addOrMergeItem(message: Message, item: TranscriptItem): void {
  const existingIndex = message.items.findIndex((entry) => entry.id === item.id)
  if (existingIndex === -1) {
    message.items.push(item)
    return
  }

  const existing = message.items[existingIndex]
  message.items[existingIndex] = {
    ...existing,
    ...item,
    content: choosePreferredText(existing.content, item.content),
    output: choosePreferredText(existing.output, item.output),
    summary: choosePreferredText(existing.summary, item.summary)
  }
}

function ensureAssistantMessage(messages: Message[], turnId: string | undefined): Message {
  const existing = messages.findLast((message) => message.role === 'assistant')
  if (existing && (!turnId || existing.id === turnId || existing.isStreaming)) {
    return existing
  }

  const next: Message = {
    id: turnId || crypto.randomUUID(),
    role: 'assistant',
    content: '',
    attachments: [],
    items: [],
    timestamp: Date.now(),
    isStreaming: false
  }
  messages.push(next)
  return next
}

function buildUserMessageFromHistory(rawItem: RawObject, fallbackId: string): Message | null {
  const role = getString(rawItem.role)
  const isLegacyUser = rawItem.type === 'userMessage'
  if (!isLegacyUser && role !== 'user' && role !== 'developer') return null

  const contentParts = Array.isArray(rawItem.content) ? rawItem.content : []
  const textParts: string[] = []
  const attachments: MessageAttachment[] = []

  contentParts.forEach((entry, index) => {
    const objectEntry = asObject(entry)
    if (!objectEntry) return
    const contentType = getString(objectEntry.type)
    if (contentType === 'text' || contentType === 'input_text' || contentType === 'output_text') {
      const text = getString(objectEntry.text)
      if (text) textParts.push(text)
      return
    }

    if (contentType === 'image' || contentType === 'input_image' || contentType === 'localImage') {
      const path = getString(objectEntry.path) || getString(objectEntry.url) || `image-${index + 1}`
      attachments.push({
        id: `${fallbackId}:attachment:${index}`,
        name: getString(objectEntry.name) || `Image ${index + 1}`,
        path,
        kind: 'image'
      })
    }

    if (contentType === 'mention') {
      const path = getString(objectEntry.path)
      const name = getString(objectEntry.name)
      if (path && name) {
        attachments.push({
          id: `${fallbackId}:attachment:${index}`,
          name,
          path,
          kind: 'document'
        })
      }
    }
  })

  return {
    id: fallbackId,
    role: 'user',
    content: textParts.join('\n\n').trim(),
    attachments,
    items: [],
    timestamp: Date.now(),
    isStreaming: false
  }
}

function upsertTaskState(threadState: ThreadBuildState, threadId: string, task: TaskCard): void {
  const existing =
    threadState.tasksById.get(task.id) ||
    (task.agentId ? threadState.tasksById.get(task.agentId) : undefined) ||
    (task.turnId ? threadState.tasksById.get(task.turnId) : undefined)

  const merged = createTaskCard({
    ...(existing || {}),
    ...task,
    id: task.id || existing?.id || crypto.randomUUID(),
    threadId,
    title: task.title || existing?.title || 'Background task',
    linkedCallIds: [
      ...new Set([...(existing?.linkedCallIds || []), ...(task.linkedCallIds || [])])
    ],
    linkedTranscriptItemIds: [
      ...new Set([
        ...(existing?.linkedTranscriptItemIds || []),
        ...(task.linkedTranscriptItemIds || [])
      ])
    ],
    results: [...new Set([...(existing?.results || []), ...(task.results || [])])]
  })

  threadState.tasksById.set(merged.id, merged)
  if (merged.agentId) {
    threadState.tasksByAgentId.set(merged.agentId, merged.id)
  }
  if (merged.turnId) {
    threadState.tasksByTurnId.set(merged.turnId, merged.id)
  }
}

export function buildThreadFromHistory(
  result: unknown,
  fallback?: Partial<Thread>,
  persistedTasks: TaskCard[] = []
): { thread: Thread | null; tasks: TaskCard[] } {
  const threadObject = asObject(asObject(result)?.thread)
  if (!threadObject) {
    return { thread: null, tasks: [] }
  }

  const threadId = getString(threadObject.id) || fallback?.id
  if (!threadId) {
    return { thread: null, tasks: [] }
  }

  const messages: Message[] = []
  const threadState: ThreadBuildState = {
    tasksById: new Map(),
    tasksByAgentId: new Map(),
    tasksByTurnId: new Map()
  }

  persistedTasks.forEach((task) => {
    upsertTaskState(threadState, threadId, {
      ...task,
      threadId,
      status:
        task.status === 'running' || task.status === 'queued' || task.status === 'waiting'
          ? 'historical'
          : task.status
    })
  })

  const turns = Array.isArray(threadObject.turns) ? threadObject.turns : []
  turns.forEach((rawTurn, turnIndex) => {
    const turn = asObject(rawTurn)
    if (!turn) return
    const turnId = getString(turn.id) || `turn:${turnIndex}`
    const items = Array.isArray(turn.items) ? turn.items : []

    items.forEach((rawEntry, itemIndex) => {
      const rawItem = asObject(rawEntry)
      if (!rawItem) return
      const itemType = getString(rawItem.type)

      if (
        itemType === 'userMessage' ||
        (itemType === 'message' && getString(rawItem.role) !== 'assistant')
      ) {
        const userMessage = buildUserMessageFromHistory(rawItem, `${turnId}:user:${itemIndex}`)
        if (userMessage) {
          messages.push(userMessage)
        }
        return
      }

      const assistantMessage = ensureAssistantMessage(messages, turnId)
      const callId = getString(rawItem.call_id) || getString(rawItem.callId)
      const existingToolItem =
        callId != null
          ? assistantMessage.items.find((item) => item.callId === callId || item.id === callId)
          : undefined
      const toolMergedRawItem =
        (itemType === 'function_call_output' || itemType === 'custom_tool_call_output') &&
        existingToolItem?.toolName
          ? {
              ...rawItem,
              name: existingToolItem.toolName,
              tool: existingToolItem.toolName,
              server: existingToolItem.server
            }
          : rawItem
      const normalized = normalizeProtocolItem(toolMergedRawItem, {
        rawFamily: 'history',
        phase: getString(rawItem.phase)
      })

      normalized.transcriptItems.forEach((item) => {
        addOrMergeItem(assistantMessage, item)
        if (item.type === 'agentMessage') {
          assistantMessage.content = choosePreferredText(assistantMessage.content, item.content)
        }
      })

      normalized.taskUpdates.forEach((task) => {
        upsertTaskState(threadState, threadId, {
          ...task,
          threadId,
          linkedTranscriptItemIds: [
            ...(task.linkedTranscriptItemIds || []),
            ...normalized.transcriptItems.map((item) => item.id)
          ]
        })
      })
    })
  })

  const thread: Thread = {
    id: threadId,
    title:
      getString(threadObject.name) ||
      getString(threadObject.preview) ||
      fallback?.title ||
      'New Thread',
    project: fallback?.project || getString(threadObject.cwd)?.split('/').pop() || 'local',
    projectPath: getString(threadObject.cwd) || fallback?.projectPath,
    createdAt:
      typeof threadObject.createdAt === 'number'
        ? threadObject.createdAt * 1000
        : fallback?.createdAt || Date.now(),
    messages,
    pinned: fallback?.pinned || false,
    unread: fallback?.unread || false,
    archived: fallback?.archived || false
  }

  thread.messages = mergeThreadMessagesWithPersisted(thread.messages, fallback?.messages || [])

  const tasks = [...threadState.tasksById.values()].map((task) => ({
    ...task,
    threadId
  }))

  return { thread, tasks }
}
