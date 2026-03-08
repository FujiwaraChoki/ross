import type { MessageAttachment, Thread } from './store'

export const DEFAULT_THREAD_TITLE = 'New Thread'
const MAX_THREAD_TITLE_LENGTH = 50

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function stripMarkdownPrefix(value: string): string {
  return value.replace(/^(?:[#>*`-]+\s+|\d+[.)]\s+)+/, '').trim()
}

function truncateTitle(value: string): string {
  return value.length <= MAX_THREAD_TITLE_LENGTH
    ? value
    : value.slice(0, MAX_THREAD_TITLE_LENGTH).trimEnd()
}

export function normalizeThreadTitleCandidate(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const normalized = truncateTitle(stripMarkdownPrefix(normalizeWhitespace(value)))
  return normalized ? normalized : null
}

export function isPlaceholderThreadTitle(title: string | undefined): boolean {
  const normalized = normalizeThreadTitleCandidate(title)
  return !normalized || normalized.toLowerCase() === DEFAULT_THREAD_TITLE.toLowerCase()
}

export function deriveThreadTitleFromInput(
  text: string,
  attachments: Pick<MessageAttachment, 'name'>[] = []
): string {
  return (
    normalizeThreadTitleCandidate(text) ||
    normalizeThreadTitleCandidate(attachments[0]?.name) ||
    DEFAULT_THREAD_TITLE
  )
}

function getAssistantItemCandidate(thread: Thread): string | null {
  for (const message of thread.messages) {
    if (message.role !== 'assistant') continue

    for (const item of message.items) {
      const candidate =
        normalizeThreadTitleCandidate(item.summary) ||
        normalizeThreadTitleCandidate(item.content) ||
        normalizeThreadTitleCandidate(item.command) ||
        normalizeThreadTitleCandidate(item.filePath) ||
        normalizeThreadTitleCandidate(item.query) ||
        normalizeThreadTitleCandidate(item.toolName) ||
        normalizeThreadTitleCandidate(item.actionTarget) ||
        normalizeThreadTitleCandidate(item.output)

      if (candidate) return candidate
    }
  }

  return null
}

export function deriveAutomaticThreadTitle(thread: Thread): string | null {
  for (const message of thread.messages) {
    if (message.role === 'user') {
      const fromContent = normalizeThreadTitleCandidate(message.content)
      if (fromContent) return fromContent

      const fromAttachment = normalizeThreadTitleCandidate(message.attachments[0]?.name)
      if (fromAttachment) return fromAttachment
    }
  }

  for (const message of thread.messages) {
    if (message.role !== 'assistant') continue

    const fromContent = normalizeThreadTitleCandidate(message.content)
    if (fromContent) return fromContent
  }

  return getAssistantItemCandidate(thread)
}

export function canApplyServerThreadTitle(thread: Thread, serverTitle: string): boolean {
  const normalizedServerTitle = normalizeThreadTitleCandidate(serverTitle)
  if (!normalizedServerTitle) return false

  if (isPlaceholderThreadTitle(thread.title)) {
    return true
  }

  const localAutomaticTitle = deriveAutomaticThreadTitle(thread)
  const normalizedCurrentTitle = normalizeThreadTitleCandidate(thread.title)

  return Boolean(localAutomaticTitle && normalizedCurrentTitle === localAutomaticTitle)
}
