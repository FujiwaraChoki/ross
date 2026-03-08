import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactElement,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileCode2, FileImage, FileText, X } from 'lucide-react'
import { ANIMATION_EASE } from '@/lib/animations'
import { useCodexStore, type Message as MessageType, type MessageAttachment } from '@/lib/store'
import { deriveThreadTitleFromInput } from '@/lib/thread-titles'
import Message from './message'

const SUGGESTIONS = [
  { emoji: '🎮', text: 'Build a classic Snake game in this repo.' },
  { emoji: '📄', text: 'Create a one-page $pdf that summarizes this app.' },
  { emoji: '🔧', text: 'Create a plan to...' }
]

interface ModelOption {
  id: string
  name: string
}

const FALLBACK_MODELS: ModelOption[] = [
  { id: 'gpt-5.3-codex', name: 'GPT-5.3-Codex' },
  { id: 'gpt-5.4', name: 'GPT-5.4' },
  { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3-Codex-Spark' },
  { id: 'gpt-5.2-codex', name: 'GPT-5.2-Codex' },
  { id: 'gpt-5.1-codex-max', name: 'GPT-5.1-Codex-Max' },
  { id: 'gpt-5.2', name: 'GPT-5.2' },
  { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1-Codex-Mini' }
]

const EMPTY_MESSAGES: MessageType[] = []
const MAX_WAVEFORM_BARS = 60
const IMAGE_EXTENSIONS = new Set([
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
  'tiff'
])

type ComposerAttachment = MessageAttachment & {
  previewUrl?: string
}

type TurnTextElement = {
  byteRange: {
    start: number
    end: number
  }
  placeholder: string | null
}

type TurnInputItem =
  | { type: 'text'; text: string; text_elements: TurnTextElement[] }
  | { type: 'localImage'; path: string }
  | { type: 'mention'; name: string; path: string }

type QueuedFollowUp = {
  threadId: string
  text: string
  userAttachments: MessageAttachment[]
  inputItems: TurnInputItem[]
  projectCwd?: string
}

type ProjectFileEntry = {
  path: string
  name: string
  relativePath: string
  directory: string
}

type ProjectFileListResult = {
  files: ProjectFileEntry[]
  truncated: boolean
}

type MentionTarget = {
  start: number
  end: number
  query: string
}

function getExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  if (idx < 0) return ''
  return name.slice(idx + 1).toLowerCase()
}

function isImageFileLike(file: { name?: string; type?: string }): boolean {
  if (file.type?.startsWith('image/')) return true
  const ext = getExtension(file.name || '')
  return IMAGE_EXTENSIONS.has(ext)
}

function hasFileTransfer(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  return Array.from(dataTransfer.types).includes('Files')
}

function formatModelId(id: string): string {
  return id
    .split('-')
    .map((part) => {
      if (/^\d/.test(part)) return part
      if (part.length <= 3) return part.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join('-')
}

function formatRecordingTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function getPathLeaf(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() || path
}

function getProjectFileIcon(name: string): typeof FileText {
  const ext = getExtension(name)

  if (IMAGE_EXTENSIONS.has(ext)) return FileImage
  if (
    ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'css', 'html', 'yml', 'yaml', 'md'].includes(
      ext
    )
  ) {
    return FileCode2
  }

  return FileText
}

function getComposerExtensionColor(name: string, kind: 'image' | 'document'): string {
  if (kind === 'image') return 'bg-violet-500/15 text-violet-600 dark:text-violet-400'

  const ext = getExtension(name)
  const colorMap: Record<string, string> = {
    ts: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    tsx: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    js: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
    jsx: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
    json: 'bg-green-500/15 text-green-600 dark:text-green-400',
    css: 'bg-pink-500/15 text-pink-600 dark:text-pink-400',
    html: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    md: 'bg-gray-500/15 text-gray-600 dark:text-gray-400',
    py: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    rs: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    go: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
  }
  return colorMap[ext] || 'bg-muted text-muted-foreground'
}

function getComposerDisplayExtension(name: string, kind: 'image' | 'document'): string {
  if (kind === 'image') return 'IMG'
  const ext = getExtension(name)
  return ext ? ext.toUpperCase() : 'FILE'
}

function getAttachmentPlaceholder(
  attachment: Pick<ComposerAttachment, 'kind' | 'name'>,
  imageIndex: number
): string {
  if (attachment.kind === 'image') {
    return `[Image #${imageIndex}]`
  }

  return `[@${attachment.name}]`
}

function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function buildTurnTextPayload(
  text: string,
  attachments: Pick<ComposerAttachment, 'kind' | 'name'>[]
): { text: string; text_elements: TurnTextElement[] } | null {
  if (!text && attachments.length === 0) return null

  let composedText = text
  let currentByteOffset = getUtf8ByteLength(composedText)
  let imageIndex = 1
  const textElements: TurnTextElement[] = []

  attachments.forEach((attachment) => {
    const separator = composedText ? ' ' : ''
    const placeholder = getAttachmentPlaceholder(attachment, imageIndex)

    if (attachment.kind === 'image') {
      imageIndex += 1
    }

    composedText += separator
    currentByteOffset += getUtf8ByteLength(separator)

    const start = currentByteOffset
    composedText += placeholder
    currentByteOffset += getUtf8ByteLength(placeholder)

    textElements.push({
      byteRange: {
        start,
        end: currentByteOffset
      },
      placeholder
    })
  })

  return {
    text: composedText,
    text_elements: textElements
  }
}

function getMentionTarget(text: string, caret: number | null | undefined): MentionTarget | null {
  if (typeof caret !== 'number' || caret < 0) return null

  let tokenStart = caret
  while (tokenStart > 0 && !/\s/.test(text[tokenStart - 1] || '')) {
    tokenStart -= 1
  }

  const token = text.slice(tokenStart, caret)
  if (!token.startsWith('@')) return null

  return {
    start: tokenStart,
    end: caret,
    query: token.slice(1)
  }
}

function getThreadIdFromThreadStartResult(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null
  const maybeThread = (result as { thread?: unknown }).thread
  if (typeof maybeThread !== 'object' || maybeThread === null) return null
  const maybeId = (maybeThread as { id?: unknown }).id
  return typeof maybeId === 'string' && maybeId ? maybeId : null
}

function getTurnIdFromTurnStartResult(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null
  const maybeTurn = (result as { turn?: unknown }).turn
  if (typeof maybeTurn !== 'object' || maybeTurn === null) return null
  const maybeId = (maybeTurn as { id?: unknown }).id
  return typeof maybeId === 'string' && maybeId ? maybeId : null
}

function getEffectiveFollowUpBehavior(
  behavior: 'queue' | 'steer',
  useOppositeBehavior: boolean
): 'queue' | 'steer' {
  if (!useOppositeBehavior) return behavior
  return behavior === 'queue' ? 'steer' : 'queue'
}

function createAttachmentRecord(
  attachment: Pick<ComposerAttachment, 'name' | 'path' | 'kind' | 'previewUrl'>
): ComposerAttachment {
  return {
    id: crypto.randomUUID(),
    name: attachment.name,
    path: attachment.path,
    kind: attachment.kind,
    previewUrl: attachment.previewUrl
  }
}

export default function Chat(): ReactElement {
  const [input, setInput] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<ComposerAttachment[]>([])
  const [isDragOverComposer, setIsDragOverComposer] = useState(false)
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_MODELS)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [projectFilePickerOpen, setProjectFilePickerOpen] = useState(false)
  const [projectFiles, setProjectFiles] = useState<ProjectFileEntry[]>([])
  const [projectFilesTruncated, setProjectFilesTruncated] = useState(false)
  const [projectFilesLoading, setProjectFilesLoading] = useState(false)
  const [projectFilesError, setProjectFilesError] = useState<string | null>(null)
  const [mentionTarget, setMentionTarget] = useState<MentionTarget | null>(null)
  const [queuedFollowUps, setQueuedFollowUps] = useState<QueuedFollowUp[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const projectFilePickerRef = useRef<HTMLDivElement>(null)
  const pendingAttachmentsRef = useRef<ComposerAttachment[]>([])
  const projectFilesCacheRef = useRef<Map<string, ProjectFileListResult>>(new Map())
  const queueDispatchInFlightRef = useRef(false)
  const interruptingForSteerRef = useRef(false)

  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const {
    threads,
    activeThreadId,
    activeTurnId,
    activeTurnThreadId,
    isStreaming,
    model,
    setModel,
    autonomyLevel,
    setAutonomyLevel,
    activeProject,
    recentProjects,
    setActiveProject,
    settings
  } = useCodexStore()

  useEffect(() => {
    window.codex
      .modelList()
      .then((result) => {
        const res = result as {
          data?: { id: string; displayName?: string; name?: string; hidden?: boolean }[]
        }
        const list = res?.data?.filter((m) => !m.hidden)
        if (list?.length) {
          setModels(
            list.map((m) => {
              const display = m.displayName || m.id
              return { id: m.id, name: display === m.id ? formatModelId(m.id) : display }
            })
          )
        }
      })
      .catch(() => {})
  }, [])

  const activeThread = threads.find((t) => t.id === activeThreadId)
  const matchingProject =
    activeThread?.project && !activeThread.projectPath
      ? recentProjects.find((project) => project.name === activeThread.project)
      : null
  const currentProjectPath =
    activeThread?.projectPath || matchingProject?.path || activeProject?.path
  const currentProjectName =
    activeThread?.project ||
    matchingProject?.name ||
    activeProject?.name ||
    (currentProjectPath ? getPathLeaf(currentProjectPath) : null)
  const messages = activeThread?.messages ?? EMPTY_MESSAGES
  const activeThreadIsStreaming =
    activeThread?.messages.some((message) => message.isStreaming) ?? false
  const activeThreadCanInterrupt =
    activeThreadIsStreaming && Boolean(activeTurnId) && activeTurnThreadId === activeThreadId

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  useEffect(() => {
    if (!projectMenuOpen) return

    const handleClick = (e: MouseEvent): void => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setProjectMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [projectMenuOpen])

  useEffect(() => {
    if (!projectFilePickerOpen) return

    const handleClick = (event: MouseEvent): void => {
      if (
        projectFilePickerRef.current &&
        !projectFilePickerRef.current.contains(event.target as Node)
      ) {
        setProjectFilePickerOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setProjectFilePickerOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [projectFilePickerOpen])

  useEffect(() => {
    setProjectFilePickerOpen(false)
    setProjectFiles([])
    setProjectFilesLoading(false)
    setProjectFilesTruncated(false)
    setProjectFilesError(null)
    setMentionTarget(null)
  }, [currentProjectPath])

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments
  }, [pendingAttachments])

  useEffect(() => {
    if (!isStreaming) {
      interruptingForSteerRef.current = false
    }
  }, [isStreaming])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
      audioContextRef.current?.close()
      pendingAttachmentsRef.current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      })
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      mediaRecorderRef.current?.stop()
    }
  }, [])

  const releaseAttachmentPreviews = useCallback((attachments: ComposerAttachment[]) => {
    attachments.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    })
  }, [])

  const appendPendingAttachments = useCallback((attachments: ComposerAttachment[]) => {
    if (attachments.length === 0) return

    setPendingAttachments((prev) => {
      const existingPaths = new Set(prev.map((attachment) => attachment.path))
      const next = [...prev]

      for (const attachment of attachments) {
        if (existingPaths.has(attachment.path)) {
          if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
          continue
        }
        existingPaths.add(attachment.path)
        next.push(attachment)
      }

      return next
    })
  }, [])

  const removePendingAttachment = useCallback((attachmentId: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((attachment) => attachment.id === attachmentId)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((attachment) => attachment.id !== attachmentId)
    })
  }, [])

  const resolveAttachmentPath = useCallback(
    async (file: File): Promise<{ path: string; name: string }> => {
      const filePath = (file as File & { path?: string }).path
      if (typeof filePath === 'string' && filePath) {
        return { path: filePath, name: file.name || filePath.split('/').pop() || 'attachment' }
      }

      const staged = await window.codex.stageAttachment({
        name: file.name || 'attachment',
        mimeType: file.type,
        data: await file.arrayBuffer()
      })
      return staged
    },
    []
  )

  const addFilesAsAttachments = useCallback(
    async (files: Iterable<File>) => {
      const fileList = Array.from(files).filter((file) => file.size > 0)
      if (fileList.length === 0) return

      const resolved = await Promise.all(
        fileList.map(async (file) => {
          try {
            const { path, name } = await resolveAttachmentPath(file)
            return createAttachmentRecord({
              name: name || file.name || 'attachment',
              path,
              kind: isImageFileLike(file) ? ('image' as const) : ('document' as const),
              previewUrl: isImageFileLike(file) ? URL.createObjectURL(file) : undefined
            })
          } catch (error) {
            console.error('Failed to add attachment:', error)
            return null
          }
        })
      )

      appendPendingAttachments(
        resolved.filter((attachment): attachment is ComposerAttachment => Boolean(attachment))
      )
    },
    [appendPendingAttachments, resolveAttachmentPath]
  )

  const addResolvedAttachments = useCallback(
    (attachments: { path: string; name: string }[]) => {
      if (attachments.length === 0) return

      appendPendingAttachments(
        attachments.map((attachment) =>
          createAttachmentRecord({
            name: attachment.name || attachment.path.split('/').pop() || 'attachment',
            path: attachment.path,
            kind: isImageFileLike(attachment) ? 'image' : 'document'
          })
        )
      )
    },
    [appendPendingAttachments]
  )

  const loadProjectFiles = useCallback(async (projectPath: string) => {
    const cached = projectFilesCacheRef.current.get(projectPath)
    if (cached) {
      setProjectFiles(cached.files)
      setProjectFilesTruncated(cached.truncated)
      setProjectFilesError(null)
      return
    }

    setProjectFilesLoading(true)
    setProjectFilesError(null)

    try {
      const result = await window.codex.listProjectFiles(projectPath)
      projectFilesCacheRef.current.set(projectPath, result)
      setProjectFiles(result.files)
      setProjectFilesTruncated(result.truncated)
    } catch (error) {
      console.error('Failed to load project files:', error)
      setProjectFiles([])
      setProjectFilesTruncated(false)
      setProjectFilesError('Could not load files from this project.')
    } finally {
      setProjectFilesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!projectFilePickerOpen || !mentionTarget) return

    void loadProjectFiles(currentProjectPath || '')
  }, [currentProjectPath, loadProjectFiles, mentionTarget, projectFilePickerOpen])

  const syncProjectFilePicker = useCallback(
    (nextValue: string, caret: number | null | undefined) => {
      const nextMentionTarget = getMentionTarget(nextValue, caret)
      setMentionTarget(nextMentionTarget)

      if (!nextMentionTarget) {
        setProjectFilePickerOpen(false)
        setProjectFilesError(null)
        return
      }

      setProjectFilePickerOpen(true)
    },
    []
  )

  const handleProjectFileSelect = useCallback(
    (file: ProjectFileEntry) => {
      addResolvedAttachments([{ path: file.path, name: file.name }])
      setInput((prev) => {
        if (!mentionTarget) return prev
        return `${prev.slice(0, mentionTarget.start)}${prev.slice(mentionTarget.end)}`
      })
      setMentionTarget(null)
      setProjectFilePickerOpen(false)
      window.setTimeout(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        const caret = mentionTarget?.start ?? textarea.value.length
        textarea.focus()
        textarea.setSelectionRange(caret, caret)
      }, 0)
    },
    [addResolvedAttachments, mentionTarget]
  )

  const addLocalUserMessage = useCallback(
    (threadId: string, text: string, attachments: MessageAttachment[]) => {
      const store = useCodexStore.getState()
      const userMessage: MessageType = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        attachments,
        items: [],
        timestamp: Date.now(),
        isStreaming: false
      }

      store.addMessage(threadId, userMessage)
    },
    []
  )

  const sendPreparedTurn = useCallback(
    async ({ threadId, inputItems, projectCwd }: QueuedFollowUp) => {
      const store = useCodexStore.getState()
      const assistantId = crypto.randomUUID()
      const assistantMessage: MessageType = {
        id: assistantId,
        role: 'assistant',
        content: '',
        attachments: [],
        items: [],
        timestamp: Date.now(),
        isStreaming: true
      }

      store.addMessage(threadId, assistantMessage)
      store.setStreamingThread(threadId)
      store.setIsStreaming(true)

      try {
        const result = await window.codex.turnStart({
          threadId,
          model: store.model,
          cwd: projectCwd,
          summary: 'detailed',
          input: inputItems
        })
        const turnId = getTurnIdFromTurnStartResult(result)
        if (turnId && useCodexStore.getState().isStreaming) {
          store.setActiveTurn(threadId, turnId)
        }
      } catch (e) {
        console.error('Failed to start turn:', e)
        store.updateMessage(threadId, assistantId, {
          content: 'Failed to get response. Please try again.',
          isStreaming: false
        })
        store.clearActiveTurn()
        store.setStreamingThread(null)
        store.setIsStreaming(false)
      }
    },
    []
  )

  const sendMessageWithInput = useCallback(
    async (
      text: string,
      attachments: ComposerAttachment[],
      options?: { useOppositeFollowUpBehavior?: boolean }
    ) => {
      if ((!text && attachments.length === 0) || isTranscribing) return

      const store = useCodexStore.getState()
      let threadId = activeThreadId
      const projectCwd = currentProjectPath

      if (!threadId) {
        try {
          const result = await window.codex.threadStart({
            personality: store.settings.personality,
            cwd: projectCwd
          })
          threadId = getThreadIdFromThreadStartResult(result) || crypto.randomUUID()
        } catch (e) {
          console.error('Failed to start thread:', e)
          threadId = crypto.randomUUID()
        }
        store.createThread(
          threadId,
          deriveThreadTitleFromInput(text, attachments),
          store.activeProject?.name,
          store.activeProject?.path
        )
      }

      const userAttachments = attachments.map(({ id, name, path, kind }) => ({
        id,
        name,
        path,
        kind
      }))
      const inputItems: TurnInputItem[] = []
      const textPayload = buildTurnTextPayload(text, attachments)

      if (textPayload) {
        inputItems.push({
          type: 'text',
          text: textPayload.text,
          text_elements: textPayload.text_elements
        })
      }
      inputItems.push(
        ...attachments.map(
          (attachment): TurnInputItem =>
            attachment.kind === 'image'
              ? { type: 'localImage', path: attachment.path }
              : { type: 'mention', name: attachment.name, path: attachment.path }
        )
      )
      const preparedTurn: QueuedFollowUp = {
        threadId,
        text,
        userAttachments,
        inputItems,
        projectCwd
      }

      addLocalUserMessage(threadId, text, userAttachments)
      setInput('')
      setPendingAttachments([])
      setMentionTarget(null)
      setProjectFilePickerOpen(false)
      releaseAttachmentPreviews(attachments)

      if (isStreaming) {
        const followUpBehavior = getEffectiveFollowUpBehavior(
          settings.followUpBehavior,
          Boolean(options?.useOppositeFollowUpBehavior)
        )

        if (
          followUpBehavior === 'steer' &&
          activeTurnId &&
          activeTurnThreadId === threadId &&
          !interruptingForSteerRef.current
        ) {
          setQueuedFollowUps((prev) => [preparedTurn, ...prev])
          interruptingForSteerRef.current = true

          try {
            await window.codex.turnInterrupt({
              threadId,
              turnId: activeTurnId
            })
          } catch (error) {
            console.error('Failed to interrupt current turn for steering:', error)
            interruptingForSteerRef.current = false
          }

          return
        }

        setQueuedFollowUps((prev) => [...prev, preparedTurn])
        return
      }

      await sendPreparedTurn(preparedTurn)
    },
    [
      activeThreadId,
      activeTurnId,
      activeTurnThreadId,
      addLocalUserMessage,
      currentProjectPath,
      isStreaming,
      isTranscribing,
      releaseAttachmentPreviews,
      sendPreparedTurn,
      settings.followUpBehavior
    ]
  )

  const sendMessage = useCallback(
    async (options?: { useOppositeFollowUpBehavior?: boolean }) => {
      const text = input.trim()
      if (!text && pendingAttachments.length === 0) return
      await sendMessageWithInput(text, pendingAttachments, options)
    },
    [input, pendingAttachments, sendMessageWithInput]
  )

  useEffect(() => {
    if (isStreaming || queuedFollowUps.length === 0 || queueDispatchInFlightRef.current) return

    const [nextFollowUp] = queuedFollowUps
    if (!nextFollowUp) return

    queueDispatchInFlightRef.current = true
    setQueuedFollowUps((prev) => prev.slice(1))

    void sendPreparedTurn(nextFollowUp).finally(() => {
      queueDispatchInFlightRef.current = false
    })
  }, [isStreaming, queuedFollowUps, sendPreparedTurn])

  const handleAttachmentButtonClick = useCallback(async () => {
    if (isRecording || isTranscribing) return

    try {
      const selectedAttachments = await window.codex.openAttachments()
      if (selectedAttachments?.length) {
        addResolvedAttachments(selectedAttachments)
        return
      }
    } catch (error) {
      console.error('Failed to open native attachment picker:', error)
    }

    fileInputRef.current?.click()
  }, [addResolvedAttachments, isRecording, isTranscribing])

  const handleAttachmentInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (files && files.length > 0) {
        void addFilesAsAttachments(files)
      }
      event.target.value = ''
    },
    [addFilesAsAttachments]
  )

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files: File[] = []

      for (const item of Array.from(event.clipboardData.items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }

      if (files.length === 0) return
      event.preventDefault()
      void addFilesAsAttachments(files)
    },
    [addFilesAsAttachments]
  )

  const visibleProjectFiles = mentionTarget
    ? projectFiles
        .filter((file) => {
          const query = mentionTarget.query.trim().toLowerCase()
          if (!query) return true

          return (
            file.name.toLowerCase().includes(query) ||
            file.relativePath.toLowerCase().includes(query)
          )
        })
        .slice(0, 200)
    : []

  const handleComposerDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasFileTransfer(event.dataTransfer)) return
    event.preventDefault()
    setIsDragOverComposer(true)
  }, [])

  const handleComposerDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasFileTransfer(event.dataTransfer)) return
    event.preventDefault()
    setIsDragOverComposer(true)
  }, [])

  const handleComposerDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && event.currentTarget.contains(nextTarget)) return
    setIsDragOverComposer(false)
  }, [])

  const handleComposerDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragOverComposer(false)
      if (!hasFileTransfer(event.dataTransfer)) return
      const files = event.dataTransfer.files
      if (files && files.length > 0) {
        void addFilesAsAttachments(files)
      }
    },
    [addFilesAsAttachments]
  )

  const handleOpenProject = useCallback(async () => {
    const result = await window.codex.openProject()
    if (result) {
      setActiveProject(result)
    }
    setProjectMenuOpen(false)
  }, [setActiveProject])

  const cleanupRecording = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
    mediaStreamRef.current = null
    audioContextRef.current?.close()
    audioContextRef.current = null
    analyserRef.current = null
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }, [])

  const transcribeAndHandle = useCallback(
    async (sendImmediately: boolean) => {
      // Build blob from recorded chunks
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      audioChunksRef.current = []

      if (blob.size === 0) return

      setIsTranscribing(true)
      try {
        const arrayBuffer = await blob.arrayBuffer()
        const text = await window.codex.transcribe(arrayBuffer)
        if (text && text.trim()) {
          if (sendImmediately) {
            await sendMessageWithInput(text.trim(), pendingAttachments)
          } else {
            setInput(text.trim())
            // Focus the textarea after transcription
            setTimeout(() => textareaRef.current?.focus(), 50)
          }
        }
      } catch (err) {
        console.error('Transcription failed:', err)
      } finally {
        setIsTranscribing(false)
      }
    },
    [pendingAttachments, sendMessageWithInput]
  )

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      // Set up AudioContext for waveform visualization
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      // Set up MediaRecorder for capturing audio
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      audioChunksRef.current = []
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }
      mediaRecorder.start(250) // collect chunks every 250ms
      mediaRecorderRef.current = mediaRecorder

      setIsRecording(true)
      setRecordingTime(0)
      setWaveformData([])

      // Timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1)
      }, 1000)

      // Waveform sampling
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      let lastSampleTime = 0
      const sampleInterval = 66

      const sample = (timestamp: number): void => {
        if (timestamp - lastSampleTime >= sampleInterval) {
          analyser.getByteTimeDomainData(dataArray)
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) {
            const val = (dataArray[i] - 128) / 128
            sum += val * val
          }
          const rms = Math.sqrt(sum / dataArray.length)
          const normalized = Math.min(1, rms * 3)

          setWaveformData((prev) => {
            const next = [...prev, normalized]
            if (next.length > MAX_WAVEFORM_BARS) next.shift()
            return next
          })
          lastSampleTime = timestamp
        }
        animationFrameRef.current = requestAnimationFrame(sample)
      }
      animationFrameRef.current = requestAnimationFrame(sample)
    } catch (err) {
      console.error('Failed to start recording:', err)
    }
  }, [])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      // Wait for the final data to be flushed before transcribing
      recorder.onstop = () => {
        transcribeAndHandle(false)
      }
      recorder.stop()
    }
    mediaRecorderRef.current = null
    cleanupRecording()
    setIsRecording(false)
    setWaveformData([])
    setRecordingTime(0)
  }, [cleanupRecording, transcribeAndHandle])

  const stopAndSend = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        transcribeAndHandle(true)
      }
      recorder.stop()
    }
    mediaRecorderRef.current = null
    cleanupRecording()
    setIsRecording(false)
    setWaveformData([])
    setRecordingTime(0)
  }, [cleanupRecording, transcribeAndHandle])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape' && projectFilePickerOpen) {
      e.preventDefault()
      setProjectFilePickerOpen(false)
      return
    }

    if (e.key !== 'Enter') return

    const hasMultipleLines = input.includes('\n')
    const mustUseMetaToSend = settings.requireMetaForMultiline && hasMultipleLines
    const hasMetaModifier = e.metaKey || e.ctrlKey
    const useOppositeFollowUpBehavior = e.shiftKey && hasMetaModifier

    if (e.shiftKey && !useOppositeFollowUpBehavior) return

    if (mustUseMetaToSend && !hasMetaModifier) {
      return
    }

    if (!mustUseMetaToSend || hasMetaModifier) {
      e.preventDefault()
      void sendMessage({ useOppositeFollowUpBehavior })
    }
  }

  const canSend = (!!input.trim() || pendingAttachments.length > 0) && !isTranscribing
  const queuedFollowUpLabel =
    queuedFollowUps.length === 1
      ? '1 follow-up queued'
      : `${queuedFollowUps.length} follow-ups queued`
  const sendButtonTitle = isStreaming
    ? settings.followUpBehavior === 'steer'
      ? 'Replace the current run with this follow-up'
      : 'Queue this follow-up after the current run'
    : 'Send message'

  const inputArea = (
    <div className="relative z-10 px-4 pb-5 bg-background">
      <div className="max-w-2xl mx-auto">
        <div
          className="relative"
          onDragEnter={handleComposerDragEnter}
          onDragOver={handleComposerDragOver}
          onDragLeave={handleComposerDragLeave}
          onDrop={handleComposerDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,.pdf,.txt,.md,.markdown,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.rtf,.odt"
            onChange={handleAttachmentInputChange}
          />
          <AnimatePresence>
            {projectFilePickerOpen && !isRecording && !isTranscribing && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.18, ease: ANIMATION_EASE }}
                className="absolute inset-x-0 bottom-full z-20 mb-3"
              >
                <div
                  ref={projectFilePickerRef}
                  className="overflow-hidden rounded-[24px] border border-border bg-popover/96 text-popover-foreground shadow-[0_24px_72px_-32px_rgba(0,0,0,0.45)] backdrop-blur-xl"
                >
                  <div className="px-4 pt-3 pb-1.5">
                    <p className="text-[10px] font-medium tracking-[0.02em] text-muted-foreground">
                      {currentProjectName
                        ? `Showing files from ${currentProjectName}`
                        : 'Showing files from the current workspace'}
                    </p>
                  </div>

                  <div className="max-h-[360px] overflow-y-auto px-2.5 pb-2.5">
                    {projectFilesLoading ? (
                      <div className="px-2 py-6 text-center text-[12px] text-muted-foreground">
                        Loading project files...
                      </div>
                    ) : projectFilesError ? (
                      <div className="px-2 py-6 text-center text-[12px] text-muted-foreground">
                        {projectFilesError}
                      </div>
                    ) : visibleProjectFiles.length === 0 ? (
                      <div className="px-2 py-6 text-center text-[12px] text-muted-foreground">
                        No matching files found.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {visibleProjectFiles.map((file, index) => {
                          const Icon = getProjectFileIcon(file.name)

                          return (
                            <button
                              key={file.path}
                              type="button"
                              onClick={() => handleProjectFileSelect(file)}
                              className={`flex w-full items-center gap-2.5 rounded-[16px] px-3 py-2 text-left transition-colors hover:bg-muted/70 ${
                                index === 0 ? 'bg-muted/80' : ''
                              }`}
                              title={file.relativePath}
                            >
                              <Icon
                                className="h-4 w-4 flex-none text-muted-foreground"
                                strokeWidth={1.8}
                              />
                              <span className="min-w-0 flex flex-1 items-baseline gap-3 overflow-hidden">
                                <span className="truncate text-[12px] font-semibold tracking-[-0.01em] text-popover-foreground">
                                  {file.name}
                                </span>
                                <span className="truncate text-[12px] text-muted-foreground">
                                  {file.directory}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {projectFilesTruncated && !projectFilesLoading && !projectFilesError && (
                    <div className="border-t border-border px-4 py-2.5 text-[10px] text-muted-foreground">
                      Showing the first 10,000 files to keep the picker responsive.
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="relative border border-border rounded-xl bg-background overflow-hidden focus-within:border-ring transition-colors">
            {pendingAttachments.length > 0 && !isRecording && !isTranscribing && (
              <div className="px-3 pt-3 pb-1 flex flex-wrap gap-2">
                {pendingAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="group/chip flex max-w-[240px] items-center gap-1.5 rounded-lg bg-muted/60 pl-2 pr-1 py-1"
                    title={attachment.path}
                  >
                    {attachment.previewUrl ? (
                      <img
                        src={attachment.previewUrl}
                        alt={attachment.name}
                        className="h-5 w-5 rounded object-cover flex-none"
                      />
                    ) : (
                      <span
                        className={`inline-flex flex-none items-center justify-center rounded px-1 py-0.5 text-[9px] font-bold tracking-wider leading-none ${getComposerExtensionColor(attachment.name, attachment.kind)}`}
                      >
                        {getComposerDisplayExtension(attachment.name, attachment.kind)}
                      </span>
                    )}
                    <span className="truncate text-[12px] font-medium text-foreground/80 font-mono">
                      {attachment.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePendingAttachment(attachment.id)}
                      className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                      title="Remove attachment"
                    >
                      <X className="h-3 w-3" strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Textarea - hidden during recording/transcribing */}
            {!isRecording && !isTranscribing && (
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  syncProjectFilePicker(e.target.value, e.target.selectionStart)
                }}
                onSelect={(e) =>
                  syncProjectFilePicker(e.currentTarget.value, e.currentTarget.selectionStart)
                }
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                placeholder="Ask Codex anything, upload, paste, or drop files"
                rows={3}
                className="w-full resize-none px-3 pt-3 pb-9 min-h-[100px] text-[14px] bg-transparent focus:outline-none placeholder:text-muted-foreground/50 placeholder:select-none"
              />
            )}

            {/* Recording / Transcribing state placeholder */}
            <AnimatePresence>
              {(isRecording || isTranscribing) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="w-full px-3 pt-3 pb-9 min-h-[100px]"
                >
                  <p className="text-[14px] text-muted-foreground/50">
                    {isTranscribing ? 'Transcribing...' : 'Listening...'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bottom bar */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2.5 py-1.5 bg-background">
              {/* Left side */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Attachment */}
                <button
                  type="button"
                  onClick={() => void handleAttachmentButtonClick()}
                  className="p-1 hover:bg-secondary rounded-md transition-colors"
                  title="Upload images or documents"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4 text-muted-foreground"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>

                {/* Model & autonomy selectors - hidden during recording */}
                {!isRecording && !isTranscribing && (
                  <>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="select-tight select-none appearance-none bg-transparent text-[12px] font-medium text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded-md hover:bg-secondary transition-colors cursor-pointer focus:outline-none"
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={autonomyLevel}
                      onChange={(e) => setAutonomyLevel(e.target.value)}
                      className="select-tight select-none appearance-none bg-transparent text-[12px] font-medium text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded-md hover:bg-secondary transition-colors cursor-pointer focus:outline-none"
                    >
                      <option value="Hand off">Hand off</option>
                      <option value="Suggest">Suggest</option>
                      <option value="Auto">Auto</option>
                    </select>
                  </>
                )}
              </div>

              {/* Waveform visualization - shown during recording */}
              {isRecording && (
                <div className="flex-1 flex items-center gap-[2px] mx-2 h-6 overflow-hidden">
                  {/* Dotted line for unfilled space */}
                  {waveformData.length < MAX_WAVEFORM_BARS && (
                    <div className="flex-1 border-b border-dotted border-muted-foreground/30" />
                  )}
                  {/* Audio bars */}
                  {waveformData.map((amplitude, i) => (
                    <div
                      key={i}
                      className="w-[2px] bg-foreground rounded-full flex-shrink-0 transition-[height] duration-75"
                      style={{ height: `${Math.max(2, amplitude * 22)}px` }}
                    />
                  ))}
                </div>
              )}

              {/* Transcribing spinner */}
              {isTranscribing && (
                <div className="flex-1 flex items-center justify-center mx-2">
                  <svg
                    className="w-4 h-4 animate-spin text-muted-foreground"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="opacity-25"
                    />
                    <path
                      d="M4 12a8 8 0 018-8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="opacity-75"
                    />
                  </svg>
                </div>
              )}

              {queuedFollowUps.length > 0 && !isRecording && !isTranscribing && (
                <span className="text-[11px] text-muted-foreground">{queuedFollowUpLabel}</span>
              )}

              {/* Right side */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Recording timer */}
                {isRecording && (
                  <span className="text-[12px] text-muted-foreground tabular-nums mr-0.5">
                    {formatRecordingTime(recordingTime)}
                  </span>
                )}

                {/* Mic / Stop button */}
                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="p-1 hover:bg-secondary rounded-md transition-colors"
                    title="Stop recording"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-4 h-4 text-foreground"
                    >
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  </button>
                ) : (
                  !isTranscribing && (
                    <button
                      onClick={startRecording}
                      disabled={isStreaming}
                      className="p-1 hover:bg-secondary rounded-md transition-colors disabled:opacity-50"
                      title="Start recording"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4 text-muted-foreground"
                      >
                        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                        <path d="M19 10v2a7 7 0 01-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                    </button>
                  )
                )}

                {/* Send / Interrupt button */}
                {activeThreadCanInterrupt && !canSend ? (
                  <button
                    onClick={() => {
                      if (!activeTurnId || !activeTurnThreadId) return
                      void window.codex.turnInterrupt({
                        threadId: activeTurnThreadId,
                        turnId: activeTurnId
                      })
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-foreground/10 hover:bg-foreground/20 transition-colors"
                    title="Interrupt current run"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-3 h-3 text-foreground"
                    >
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                  </button>
                ) : isRecording ? (
                  <button
                    onClick={stopAndSend}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
                    title="Send recording"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-3.5 h-3.5"
                    >
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={() => void sendMessage()}
                    disabled={!canSend}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-accent disabled:bg-muted disabled:text-muted-foreground text-accent-foreground hover:opacity-90 transition-opacity"
                    title={sendButtonTitle}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-3.5 h-3.5"
                    >
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            {isDragOverComposer && (
              <div className="pointer-events-none absolute inset-0 z-10 rounded-xl border border-accent bg-background/90 flex items-center justify-center text-[13px] text-foreground">
                Drop images or documents to attach
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  // Empty state
  if (!activeThread || messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: ANIMATION_EASE }}
            className="flex flex-col items-center gap-3"
          >
            {/* Circular arrows icon */}
            <img src="./logo.png" alt="Ross" className="w-16 h-16" />

            {/* Heading */}
            <h1 className="text-2xl font-semibold text-foreground">Let&apos;s build</h1>

            {/* Project selector */}
            <div className="relative" ref={projectMenuRef}>
              <button
                onClick={() => setProjectMenuOpen((open) => !open)}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                title="Switch project"
              >
                <span className="text-[15px] font-medium tracking-wide uppercase">
                  {activeProject?.name || 'ross'}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-3.5 h-3.5"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {projectMenuOpen && (
                <div className="absolute left-1/2 top-full z-50 mt-2 w-52 -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                  <div className="py-1">
                    <button
                      onClick={handleOpenProject}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-[13px] text-popover-foreground transition-colors hover:bg-secondary"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        className="h-4 w-4 text-muted-foreground"
                      >
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                        <line x1="12" y1="11" x2="12" y2="17" />
                        <line x1="9" y1="14" x2="15" y2="14" />
                      </svg>
                      Open project...
                    </button>

                    {activeProject && (
                      <button
                        onClick={() => {
                          setActiveProject(null)
                          setProjectMenuOpen(false)
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-popover-foreground"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          className="h-4 w-4"
                        >
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                        Clear project
                      </button>
                    )}
                  </div>

                  {recentProjects.length > 0 && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="py-1">
                        <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground">
                          Recent
                        </div>
                        {recentProjects.map((project) => (
                          <button
                            key={project.path}
                            onClick={() => {
                              setActiveProject(project)
                              setProjectMenuOpen(false)
                            }}
                            className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors hover:bg-secondary ${
                              activeProject?.path === project.path
                                ? 'text-accent'
                                : 'text-popover-foreground'
                            }`}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              className="h-4 w-4 shrink-0 text-muted-foreground"
                            >
                              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                            </svg>
                            <span className="truncate">{project.name}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Suggestions */}
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2, ease: ANIMATION_EASE }}
            className="px-4 pb-3"
          >
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-end gap-2 mb-2">
                <button className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">
                  Explore more
                </button>
                <button
                  onClick={() => setShowSuggestions(false)}
                  className="text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3.5 h-3.5"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(s.text)
                      textareaRef.current?.focus()
                    }}
                    className="flex flex-col gap-2 p-3 text-left rounded-xl border border-border bg-background hover:bg-secondary/50 transition-colors"
                  >
                    <span className="text-base">{s.emoji}</span>
                    <span className="text-[13px] text-foreground leading-snug">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {inputArea}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="max-w-2xl mx-auto px-6 py-5 space-y-4">
          {messages.map((msg) => (
            <Message key={msg.id} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
      {inputArea}
    </div>
  )
}
