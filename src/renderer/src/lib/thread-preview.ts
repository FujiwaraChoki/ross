import type { Thread } from './store'

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd() + '\u2026'
}

export function getThreadPreview(thread: Thread): string {
  if (thread.messages.length === 0) return ''

  const lastMessage = thread.messages[thread.messages.length - 1]

  if (lastMessage.role === 'user') {
    const text = stripMarkdown(lastMessage.content)
    return truncate(text, 80)
  }

  // Assistant message — scan items in reverse for meaningful content
  for (let i = lastMessage.items.length - 1; i >= 0; i--) {
    const item = lastMessage.items[i]
    switch (item.type) {
      case 'agentMessage':
        if (item.content) return truncate(stripMarkdown(item.content), 80)
        break
      case 'commandExecution':
        if (item.command) return truncate(`$ ${item.command}`, 80)
        break
      case 'fileChange':
        if (item.filePath) return truncate(item.filePath, 80)
        break
    }
  }

  // Fallback to message content
  if (lastMessage.content) {
    return truncate(stripMarkdown(lastMessage.content), 80)
  }

  return ''
}
