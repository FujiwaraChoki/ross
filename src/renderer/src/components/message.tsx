import { useState, useCallback, type ReactElement } from 'react'
import { Check, ChevronDown, Copy } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { ANIMATION_EASE } from '@/lib/animations'
import CodeBlock from './code-block'
import MarkdownRenderer from './markdown-renderer'
import { useCodexStore, type Message as MessageType, type MessageItem } from '@/lib/store'

const UI_TEXT_SIZE_CLASS = 'text-[length:var(--app-ui-font-size)]'
const DISCLOSURE_TRIGGER_CLASS = 'flex items-center gap-2 py-1 text-left'
const DISCLOSURE_BODY_CLASS = 'ml-[7px] border-l border-border/40 pl-4 py-1'

function InlineCode({ children }: { children: string }): ReactElement {
  return (
    <code className="px-1 py-0.5 bg-secondary rounded text-[length:var(--app-code-font-size)] font-mono">
      {children}
    </code>
  )
}

function TerminalOutput({ text }: { text: string }): ReactElement {
  return (
    <div className="bg-terminal-bg rounded-md px-4 py-2.5 text-[length:var(--app-code-font-size)] text-muted-foreground font-mono leading-relaxed">
      {text}
    </div>
  )
}

function WorkDivider({ duration }: { duration?: string }): ReactElement {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1 h-px bg-border" />
      <span className={`${UI_TEXT_SIZE_CLASS} text-muted-foreground`}>
        Worked for {duration || '...'}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

function MetadataLine({ label, value }: { label: string; value?: string }): ReactElement | null {
  if (!value) return null
  return (
    <div className={`${UI_TEXT_SIZE_CLASS} text-muted-foreground`}>
      <span className="font-medium text-foreground/90">{label}: </span>
      {value}
    </div>
  )
}

function truncateText(text: string, max = 96): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 3)}...`
}

function getExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  if (idx < 0) return ''
  return name.slice(idx + 1).toLowerCase()
}

function getExtensionColor(name: string, kind: 'image' | 'document'): string {
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

function getDisplayExtension(name: string, kind: 'image' | 'document'): string {
  if (kind === 'image') return 'IMG'
  const ext = getExtension(name)
  return ext ? ext.toUpperCase() : 'FILE'
}

function normalizeCommandOutput(command: string | undefined, output: string | undefined): string {
  if (!output) return ''
  if (!command) return output

  const withPrompt = `$ ${command}`
  if (output === command || output === withPrompt) return ''
  if (output.startsWith(`${command}\n`)) return output.slice(command.length + 1)
  if (output.startsWith(`${withPrompt}\n`)) return output.slice(withPrompt.length + 1)
  return output
}

function getMeaningfulText(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (value?.trim()) return value
  }
  return ''
}

function CommandExecutionItem({ item }: { item: MessageItem }): ReactElement {
  const status = (item.status || '').toLowerCase()
  const failed = status.includes('fail') || status.includes('error') || status.includes('cancel')
  const finished =
    failed || item.completed || status.includes('complete') || status.includes('success')
  const commandText = item.command || 'command'
  const summaryPrefix = failed
    ? 'Background terminal failed with'
    : finished
      ? 'Background terminal finished with'
      : 'Background terminal running'
  const normalizedOutput = normalizeCommandOutput(item.command, item.output)

  const [expanded, setExpanded] = useState(false)

  return (
    <div className="my-2">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full py-1.5 text-left group/cmd"
      >
        <div className="flex items-center justify-between gap-3">
          <p
            className={`${UI_TEXT_SIZE_CLASS} text-muted-foreground group-hover/cmd:text-foreground transition-colors truncate`}
          >
            {summaryPrefix} {truncateText(commandText, 110)}
          </p>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="shrink-0"
          >
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="command-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-1 space-y-3">
              <div className="rounded-xl bg-secondary/50 px-5 py-4 max-h-[320px] overflow-auto text-[length:var(--app-code-font-size)] font-mono whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
                {item.command && <span className="text-foreground">$ {item.command}</span>}
                {normalizedOutput && (
                  <>
                    {'\n\n'}
                    {normalizedOutput}
                  </>
                )}
              </div>
              {finished && !failed && (
                <div className="flex items-center justify-end gap-1.5 text-muted-foreground">
                  <Check className="w-3.5 h-3.5" />
                  <span className={UI_TEXT_SIZE_CLASS}>Success</span>
                </div>
              )}
              {failed && (
                <div className="flex items-center justify-end gap-1.5 text-red-600">
                  <span className={UI_TEXT_SIZE_CLASS}>Failed</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ReasoningItem({ item }: { item: MessageItem }): ReactElement | null {
  const [open, setOpen] = useState(false)
  const reasoningText = getMeaningfulText(item.summary, item.content)
  if (!reasoningText && item.completed) return null

  return (
    <div className="my-2">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`${DISCLOSURE_TRIGGER_CLASS} select-none ${UI_TEXT_SIZE_CLASS} cursor-pointer text-muted-foreground transition-colors hover:text-foreground`}
      >
        <motion.div
          animate={{ rotate: open ? 0 : -90 }}
          transition={{ duration: 0.15, ease: 'easeInOut' }}
          className="shrink-0"
        >
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </motion.div>
        Reasoning
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="reasoning-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className={DISCLOSURE_BODY_CLASS}>
              <MarkdownRenderer
                markdown={reasoningText}
                className="text-muted-foreground leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ItemRenderer({ item }: { item: MessageItem }): ReactElement | null {
  switch (item.type) {
    case 'agentMessage':
      return <MarkdownRenderer markdown={item.content || ''} />

    case 'commandExecution':
      return <CommandExecutionItem item={item} />

    case 'fileChange':
      return (
        <div className="my-2 overflow-hidden">
          <div className="flex items-center gap-2 py-1.5">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-3.5 h-3.5 text-muted-foreground"
            >
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            <span className={`${UI_TEXT_SIZE_CLASS} text-muted-foreground font-mono`}>
              {item.filePath}
            </span>
            {item.changeType && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {item.changeType}
              </span>
            )}
          </div>
          {item.content && <CodeBlock code={item.content} language="diff" />}
        </div>
      )

    case 'reasoning':
      return <ReasoningItem item={item} />

    case 'plan':
      return (
        <details className="my-2 group" open>
          <summary
            className={`${DISCLOSURE_TRIGGER_CLASS} ${UI_TEXT_SIZE_CLASS} list-none cursor-pointer text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden`}
          >
            <span className="shrink-0 -rotate-90 transition-transform duration-150 ease-in-out group-open:rotate-0">
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </span>
            Plan
          </summary>
          <div
            className={`${DISCLOSURE_BODY_CLASS} ${UI_TEXT_SIZE_CLASS} text-muted-foreground leading-relaxed whitespace-pre-wrap`}
          >
            {item.content}
          </div>
        </details>
      )

    case 'mcpToolCall':
    case 'dynamicToolCall':
    case 'collabToolCall':
    case 'webSearch':
    case 'imageView':
    case 'contextCompaction':
    case 'enteredReviewMode':
    case 'exitedReviewMode':
    case 'unknown': {
      const hasVisibleData = Boolean(
        item.status ||
        item.toolName ||
        item.server ||
        item.query ||
        item.actionType ||
        item.actionTarget ||
        item.argumentsText ||
        item.resultText ||
        item.output ||
        item.content
      )
      if (!hasVisibleData) return null

      return (
        <div className="my-2 py-2 space-y-1.5">
          <span className={`${UI_TEXT_SIZE_CLASS} uppercase tracking-wide text-muted-foreground`}>
            {item.type}
          </span>
          <MetadataLine
            label="Tool"
            value={item.server && item.toolName ? `${item.server}.${item.toolName}` : item.toolName}
          />
          <MetadataLine
            label="Action"
            value={
              item.actionType && item.actionTarget
                ? `${item.actionType}: ${item.actionTarget}`
                : item.actionType || item.actionTarget
            }
          />
          <MetadataLine label="Query" value={item.query} />
          {item.argumentsText && (
            <details>
              <summary className={`${UI_TEXT_SIZE_CLASS} text-muted-foreground cursor-pointer`}>
                Arguments
              </summary>
              <CodeBlock code={item.argumentsText} language="json" />
            </details>
          )}
          {item.resultText && (
            <details>
              <summary className={`${UI_TEXT_SIZE_CLASS} text-muted-foreground cursor-pointer`}>
                Result
              </summary>
              <CodeBlock code={item.resultText} language="json" />
            </details>
          )}
          {item.output && (
            <details>
              <summary className={`${UI_TEXT_SIZE_CLASS} text-muted-foreground cursor-pointer`}>
                Output
              </summary>
              <TerminalOutput text={item.output} />
            </details>
          )}
          {item.content && !item.argumentsText && !item.resultText && (
            <div
              className={`${UI_TEXT_SIZE_CLASS} text-muted-foreground whitespace-pre-wrap leading-relaxed`}
            >
              {item.content}
            </div>
          )}
        </div>
      )
    }

    default:
      return (
        <div
          className={`${UI_TEXT_SIZE_CLASS} text-muted-foreground whitespace-pre-wrap leading-relaxed`}
        >
          {item.content || item.output || ''}
        </div>
      )
  }
}

// --- Tool Call Grouping (rolling output) ---

const GROUPABLE_TYPES = new Set<MessageItem['type']>([
  'commandExecution',
  'fileChange',
  'mcpToolCall',
  'dynamicToolCall',
  'collabToolCall',
  'webSearch',
  'imageView',
  'contextCompaction',
  'enteredReviewMode',
  'exitedReviewMode',
  'unknown'
])

type RenderSegment = { kind: 'item'; item: MessageItem } | { kind: 'group'; items: MessageItem[] }

function groupItems(items: MessageItem[]): RenderSegment[] {
  const segments: RenderSegment[] = []
  let pending: MessageItem[] = []

  const flush = (): void => {
    if (pending.length === 0) return
    if (pending.length === 1) {
      segments.push({ kind: 'item', item: pending[0] })
    } else {
      segments.push({ kind: 'group', items: [...pending] })
    }
    pending = []
  }

  for (const item of items) {
    if (GROUPABLE_TYPES.has(item.type)) {
      pending.push(item)
    } else {
      flush()
      segments.push({ kind: 'item', item })
    }
  }
  flush()
  return segments
}

function getCompactLabel(item: MessageItem): string {
  if (item.actionType && item.actionTarget) {
    const verb = item.actionType.charAt(0).toUpperCase() + item.actionType.slice(1)
    return `${verb} ${truncateText(item.actionTarget, 50)}`
  }
  switch (item.type) {
    case 'commandExecution':
      return item.command ? truncateText(item.command, 60) : 'Command'
    case 'fileChange': {
      const verb =
        item.changeType === 'create' ? 'Create' : item.changeType === 'delete' ? 'Delete' : 'Edit'
      return `${verb} ${item.filePath || 'file'}`
    }
    case 'webSearch':
      return `Search ${item.query ? truncateText(item.query, 40) : 'web'}`
    case 'mcpToolCall':
    case 'dynamicToolCall':
    case 'collabToolCall': {
      const name = item.toolName || 'tool'
      return item.server ? `${item.server}.${name}` : name
    }
    case 'imageView':
      return `View ${item.actionTarget || 'image'}`
    case 'contextCompaction':
      return 'Compact context'
    case 'enteredReviewMode':
      return 'Entered review mode'
    case 'exitedReviewMode':
      return 'Exited review mode'
    default:
      return item.content ? truncateText(item.content, 40) : item.type
  }
}

function getGroupSummary(items: MessageItem[]): string {
  const counts = new Map<string, number>()
  for (const item of items) {
    let cat: string
    switch (item.type) {
      case 'commandExecution':
        cat = 'command'
        break
      case 'fileChange':
        cat = 'edit'
        break
      case 'webSearch':
        cat = 'search'
        break
      default:
        cat = 'tool call'
        break
    }
    counts.set(cat, (counts.get(cat) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => `${count} ${count === 1 ? label : label + 's'}`)
    .join(', ')
}

function ToolCallGroupItem({ item }: { item: MessageItem }): ReactElement {
  const [detailOpen, setDetailOpen] = useState(false)
  const label = getCompactLabel(item)
  const hasDetail = Boolean(item.output || item.content || item.resultText)

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: ANIMATION_EASE }}
    >
      <button
        type="button"
        onClick={() => hasDetail && setDetailOpen((prev) => !prev)}
        disabled={!hasDetail}
        className={`w-full flex items-center gap-2 py-0.5 text-left ${UI_TEXT_SIZE_CLASS} font-mono truncate ${
          item.completed ? 'text-muted-foreground' : 'text-foreground/80'
        } ${hasDetail ? 'hover:text-foreground transition-colors' : ''}`}
      >
        {item.completed ? (
          <Check className="w-3 h-3 text-muted-foreground/50 shrink-0" />
        ) : (
          <motion.span
            className="w-3 h-3 flex items-center justify-center shrink-0"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/60" />
          </motion.span>
        )}
        <span className="truncate">{label}</span>
      </button>
      <AnimatePresence initial={false}>
        {detailOpen && hasDetail && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div
              className={`ml-5 mt-1 mb-2 max-h-[200px] overflow-auto rounded-md bg-secondary/40 px-3 py-2 ${UI_TEXT_SIZE_CLASS} font-mono text-muted-foreground whitespace-pre-wrap`}
            >
              {item.output || item.resultText || item.content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function ToolCallGroup({ items }: { items: MessageItem[] }): ReactElement {
  const allCompleted = items.every((i) => i.completed)
  const [expanded, setExpanded] = useState(false)

  const summary = getGroupSummary(items)
  const groupLabel = allCompleted ? 'Explored' : 'Exploring'

  return (
    <div className="my-2">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className={`${DISCLOSURE_TRIGGER_CLASS} group/exploration`}
      >
        <motion.div
          animate={{ rotate: expanded ? 0 : -90 }}
          transition={{ duration: 0.15, ease: 'easeInOut' }}
          className="shrink-0"
        >
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </motion.div>
        <span className={`${UI_TEXT_SIZE_CLASS} text-muted-foreground`}>{groupLabel}</span>
        <span
          className={`${UI_TEXT_SIZE_CLASS} text-foreground/60 transition-colors group-hover/exploration:text-foreground`}
        >
          {summary}
        </span>
        {!allCompleted && (
          <motion.span
            className="h-1.5 w-1.5 rounded-full bg-foreground/50"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        )}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="group-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className={DISCLOSURE_BODY_CLASS}>
              {items.map((item) => (
                <ToolCallGroupItem key={item.id} item={item} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StreamingDot({ active }: { active: boolean }): ReactElement | null {
  if (!active) return null

  return (
    <span className="inline-flex items-center ml-0.5 align-middle">
      <motion.span
        className="inline-flex h-2.5 w-2.5 rounded-full bg-foreground/70"
        animate={{
          opacity: [0.3, 1, 0.3],
          scale: [0.8, 1.2, 0.8]
        }}
        transition={{
          duration: 1.2,
          ease: 'easeInOut',
          repeat: Infinity
        }}
      />
    </span>
  )
}

function AssistantCopyButton({ text }: { text: string }): ReactElement {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [text])

  return (
    <div className="opacity-0 group-hover/assistant:opacity-100 transition-opacity duration-150">
      <button
        type="button"
        onClick={handleCopy}
        className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded-md"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function UserCopyButton({ text }: { text: string }): ReactElement {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [text])

  return (
    <div className="flex justify-end opacity-0 group-hover/user:opacity-100 transition-opacity duration-150">
      <button
        type="button"
        onClick={handleCopy}
        className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded-md"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

interface MessageProps {
  message: MessageType
}

export default function Message({ message }: MessageProps): ReactElement {
  const threadDetail = useCodexStore((state) => state.settings.threadDetail)
  const isUser = message.role === 'user'
  const attachments = message.attachments || []
  const itemAgentText = message.items
    .filter((item) => item.type === 'agentMessage')
    .map((item) => item.content)
    .join('')
  const assistantText = itemAgentText || message.content

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: ANIMATION_EASE }}
    >
      {isUser ? (
        <div className="group/user ml-auto w-fit max-w-[85%] space-y-1.5">
          {message.content && (
            <div className="bg-secondary/50 rounded-xl px-4 py-3">
              <div
                className={`${UI_TEXT_SIZE_CLASS} leading-[1.65] whitespace-pre-wrap text-foreground`}
              >
                {message.content}
              </div>
            </div>
          )}
          {attachments.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {attachments.map((attachment) => (
                <span
                  key={attachment.id}
                  className="inline-flex max-w-[240px] items-center gap-1.5 rounded-lg bg-secondary/40 px-2 py-1 text-left"
                  title={attachment.path}
                >
                  <span
                    className={`inline-flex flex-none items-center justify-center rounded px-1 py-0.5 text-[9px] font-bold tracking-wider leading-none ${getExtensionColor(attachment.name, attachment.kind)}`}
                  >
                    {getDisplayExtension(attachment.name, attachment.kind)}
                  </span>
                  <span className="truncate text-[12px] font-medium text-muted-foreground font-mono">
                    {attachment.name}
                  </span>
                </span>
              ))}
            </div>
          )}
          {message.content && <UserCopyButton text={message.content} />}
        </div>
      ) : (
        <div className="group/assistant space-y-1">
          {message.items.length > 0 && threadDetail === 'steps_with_code_commands' ? (
            groupItems(message.items).map((segment) =>
              segment.kind === 'group' ? (
                <ToolCallGroup key={segment.items[0].id} items={segment.items} />
              ) : (
                <ItemRenderer key={segment.item.id} item={segment.item} />
              )
            )
          ) : (
            <MarkdownRenderer markdown={assistantText} />
          )}
          <StreamingDot active={message.isStreaming} />
          {assistantText && !message.isStreaming && <AssistantCopyButton text={assistantText} />}
        </div>
      )}
    </motion.div>
  )
}

export { WorkDivider, TerminalOutput, InlineCode }
