import {
  memo,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type CSSProperties,
  type ReactElement
} from 'react'
import { parsePatchFiles, registerCustomCSSVariableTheme } from '@pierre/diffs'
import { FileDiff, type FileDiffMetadata, type FileDiffProps } from '@pierre/diffs/react'
import { Check, ChevronDown, Copy } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { ANIMATION_EASE } from '@/lib/animations'
import CodeBlock from './code-block'
import CodeCommentCard from './code-comment-card'
import { Shimmer } from './shimmer'
import MarkdownRenderer from './markdown-renderer'
import { parseAssistantText } from '@/lib/codex-normalization'
import { resolveThemeMode } from '@/lib/ui-preferences'
import {
  useCodexStore,
  type DirectiveCard,
  type Message as MessageType,
  type MessageItem,
  type OpenDestination
} from '@/lib/store'

const UI_TEXT_SIZE_CLASS = 'text-[14px]'
const DISCLOSURE_TRIGGER_CLASS = 'flex items-center gap-2 py-1 text-left'
const DISCLOSURE_BODY_CLASS = 'ml-[7px] border-l border-border/40 pl-4 py-1'
const ROSS_DIFF_LIGHT_THEME = 'ross-diff-light'
const ROSS_DIFF_DARK_THEME = 'ross-diff-dark'

registerCustomCSSVariableTheme(
  ROSS_DIFF_LIGHT_THEME,
  {
    background: 'var(--card, #ffffff)',
    foreground: 'var(--foreground, #1a1a1a)',
    'ansi-green': 'color-mix(in srgb, var(--accent, #88fade) 55%, #2f8f68 45%)',
    'ansi-bright-green': 'color-mix(in srgb, var(--accent, #88fade) 55%, #2f8f68 45%)',
    'ansi-red': '#c76868',
    'ansi-bright-red': '#c76868',
    'ansi-blue': 'color-mix(in srgb, var(--accent, #88fade) 78%, #1a1a1a 22%)',
    'ansi-bright-blue': 'color-mix(in srgb, var(--accent, #88fade) 78%, #1a1a1a 22%)'
  },
  false
)

registerCustomCSSVariableTheme(
  ROSS_DIFF_DARK_THEME,
  {
    background: 'var(--terminal-bg, #181818)',
    foreground: 'var(--foreground, #e5e5e5)',
    'ansi-green': 'color-mix(in srgb, var(--accent, #88fade) 65%, #3fbf84 35%)',
    'ansi-bright-green': 'color-mix(in srgb, var(--accent, #88fade) 65%, #3fbf84 35%)',
    'ansi-red': '#ff8b8b',
    'ansi-bright-red': '#ff8b8b',
    'ansi-blue': 'color-mix(in srgb, var(--accent, #88fade) 82%, white 18%)',
    'ansi-bright-blue': 'color-mix(in srgb, var(--accent, #88fade) 82%, white 18%)'
  },
  false
)

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

function getBaseName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

function formatTaskStatusLabel(status?: string): string {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'waiting':
      return 'Waiting'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'historical':
      return 'Historical'
    default:
      return 'Unknown'
  }
}

function openLocalPath(path: string, editor: OpenDestination): void {
  void window.codex
    .openFileLink({
      href: path,
      editor
    })
    .catch((error) => {
      console.error('Failed to open linked file', error)
    })
}

function DirectiveCardItem({
  directive,
  fallbackContent
}: {
  directive: DirectiveCard
  fallbackContent: string
}): ReactElement {
  const defaultOpenDestination = useCodexStore((state) => state.settings.defaultOpenDestination)
  const shouldHydrateDirective =
    directive.source.startsWith('::') &&
    (!directive.title ||
      (!directive.body && directive.source.includes('body=')) ||
      (!directive.filePath && directive.source.includes('file=')) ||
      (directive.priority == null && directive.source.includes('priority=')) ||
      (directive.confidence == null && directive.source.includes('confidence=')))
  const hydratedDirective = shouldHydrateDirective
    ? (() => {
        const reparsedDirective = parseAssistantText(directive.source).directives[0]
        return reparsedDirective
          ? {
              ...directive,
              ...reparsedDirective,
              id: directive.id
            }
          : directive
      })()
    : directive

  if (hydratedDirective.kind === 'codeComment') {
    return <CodeCommentCard directive={hydratedDirective} />
  }

  const fileMeta =
    hydratedDirective.filePath && hydratedDirective.start
      ? `${hydratedDirective.filePath}:${hydratedDirective.start}${hydratedDirective.end ? `-${hydratedDirective.end}` : ''}`
      : hydratedDirective.filePath

  return (
    <div className="my-3 rounded-2xl border border-border/70 bg-card/80 px-4 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-ui-10 uppercase tracking-[0.18em] text-muted-foreground">
            {hydratedDirective.kind === 'inboxItem'
              ? 'Inbox'
              : hydratedDirective.kind === 'automationUpdate'
                ? 'Automation'
                : hydratedDirective.kind === 'archive' || hydratedDirective.kind === 'archiveThread'
                  ? 'Archive'
                  : 'Directive'}
          </div>
          <div className={`${UI_TEXT_SIZE_CLASS} font-medium text-foreground`}>
            {hydratedDirective.title ||
              hydratedDirective.name ||
              hydratedDirective.summary ||
              'Codex directive'}
          </div>
        </div>
        {hydratedDirective.status && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-ui-10 uppercase tracking-[0.14em] text-muted-foreground">
            {hydratedDirective.status}
          </span>
        )}
      </div>

      {hydratedDirective.summary && (
        <p className={`${UI_TEXT_SIZE_CLASS} mt-2 leading-relaxed text-muted-foreground`}>
          {hydratedDirective.summary}
        </p>
      )}
      {hydratedDirective.body && (
        <p className={`${UI_TEXT_SIZE_CLASS} mt-2 leading-relaxed text-muted-foreground`}>
          {hydratedDirective.body}
        </p>
      )}
      {hydratedDirective.prompt && (
        <div className="mt-3 rounded-xl bg-secondary/50 px-3 py-2">
          <p className="text-ui-10 uppercase tracking-[0.16em] text-muted-foreground">Prompt</p>
          <p className={`${UI_TEXT_SIZE_CLASS} mt-1 leading-relaxed text-foreground`}>
            {hydratedDirective.prompt}
          </p>
        </div>
      )}
      {(hydratedDirective.mode || hydratedDirective.rrule || hydratedDirective.cwds?.length) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {hydratedDirective.mode && (
            <span className="rounded-full bg-secondary px-2 py-1 text-ui-10 uppercase tracking-[0.14em] text-muted-foreground">
              {hydratedDirective.mode}
            </span>
          )}
          {hydratedDirective.rrule && (
            <span className="rounded-full bg-secondary px-2 py-1 text-ui-10 uppercase tracking-[0.14em] text-muted-foreground">
              Scheduled
            </span>
          )}
          {hydratedDirective.cwds?.map((cwd) => (
            <span
              key={cwd}
              className="rounded-full bg-secondary px-2 py-1 text-ui-10 text-muted-foreground"
            >
              {truncateText(cwd, 40)}
            </span>
          ))}
        </div>
      )}
      {hydratedDirective.filePath && (
        <button
          type="button"
          onClick={() => openLocalPath(hydratedDirective.filePath!, defaultOpenDestination)}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-ui-11 text-foreground transition-colors hover:bg-secondary/80"
          title={fileMeta}
        >
          <span className="font-mono">
            {truncateText(fileMeta || hydratedDirective.filePath, 80)}
          </span>
        </button>
      )}
      {!hydratedDirective.title &&
        !hydratedDirective.summary &&
        !hydratedDirective.body &&
        !hydratedDirective.prompt && (
          <div className="mt-3">
            <CodeBlock code={fallbackContent} language="text" />
          </div>
        )}
    </div>
  )
}

function TaskStatusItem({ item }: { item: MessageItem }): ReactElement {
  return (
    <div className="my-3 rounded-2xl border border-border/60 bg-secondary/35 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-ui-10 uppercase tracking-[0.18em] text-muted-foreground">Task</span>
        <Shimmer
          active={item.status === 'running'}
          highlightColor="var(--foreground)"
          className="rounded-full bg-background/80 px-2 py-0.5 text-ui-10 uppercase tracking-[0.14em] text-muted-foreground"
        >
          {formatTaskStatusLabel(item.status)}
        </Shimmer>
      </div>
      <div className={`${UI_TEXT_SIZE_CLASS} mt-2 text-foreground`}>
        {item.summary || item.content || 'Background task update'}
      </div>
    </div>
  )
}

function CommandExecutionItem({ item }: { item: MessageItem }): ReactElement {
  const status = (item.status || '').toLowerCase()
  const failed = status.includes('fail') || status.includes('error') || status.includes('cancel')
  const finished =
    failed || item.completed || status.includes('complete') || status.includes('success')
  const commandText = item.command || 'command'
  const summaryPrefix = failed ? 'Failed' : finished ? 'Ran' : 'Running'
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
          <Shimmer
            active={!finished}
            highlightColor="var(--foreground)"
            className={`${UI_TEXT_SIZE_CLASS} text-muted-foreground group-hover/cmd:text-foreground transition-colors truncate`}
          >
            {summaryPrefix} {truncateText(commandText, 110)}
          </Shimmer>
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

const FILE_DIFF_OPTIONS: NonNullable<FileDiffProps<undefined>['options']> = {
  diffStyle: 'unified',
  hunkSeparators: 'simple',
  overflow: 'scroll',
  disableFileHeader: true,
  theme: {
    light: ROSS_DIFF_LIGHT_THEME,
    dark: ROSS_DIFF_DARK_THEME
  }
}

type DiffThemeStyle = CSSProperties & Record<`--${string}`, string>

const FILE_DIFF_THEME_STYLE: DiffThemeStyle = {
  '--bg': 'var(--card)',
  '--fg': 'var(--foreground)',
  '--diffs-background': 'var(--card)',
  '--diffs-foreground': 'var(--foreground)',
  '--diffs-font-family':
    "var(--app-code-font-family, 'SF Mono', 'Menlo', 'Monaco', ui-monospace, monospace)",
  '--diffs-header-font-family':
    "var(--app-code-font-family, 'SF Mono', 'Menlo', 'Monaco', ui-monospace, monospace)",
  '--diffs-font-size': 'var(--app-code-font-size, 13px)',
  '--diffs-line-height': 'calc(var(--app-code-font-size, 13px) + 8px)',
  '--diffs-gap-inline': '10px',
  '--diffs-gap-block': '10px',
  '--diffs-bg-separator-override': 'color-mix(in srgb, var(--secondary) 92%, transparent)',
  '--diffs-bg-buffer-override': 'color-mix(in srgb, var(--muted) 76%, transparent)',
  '--diffs-bg-hover-override': 'color-mix(in srgb, var(--secondary) 88%, transparent)',
  '--diffs-bg-context-override': 'color-mix(in srgb, var(--background) 96%, var(--foreground) 4%)',
  '--diffs-fg-number-override': 'var(--muted-foreground)',
  '--diffs-bg-addition-override': 'color-mix(in srgb, var(--accent) 15%, transparent)',
  '--diffs-bg-addition-number-override': 'color-mix(in srgb, var(--accent) 22%, transparent)',
  '--diffs-bg-addition-hover-override': 'color-mix(in srgb, var(--accent) 20%, transparent)',
  '--diffs-bg-addition-emphasis-override': 'color-mix(in srgb, var(--accent) 28%, transparent)',
  '--diffs-bg-deletion-override': 'color-mix(in srgb, #d96b6b 14%, transparent)',
  '--diffs-bg-deletion-number-override': 'color-mix(in srgb, #d96b6b 20%, transparent)',
  '--diffs-bg-deletion-hover-override': 'color-mix(in srgb, #d96b6b 18%, transparent)',
  '--diffs-bg-deletion-emphasis-override': 'color-mix(in srgb, #d96b6b 26%, transparent)',
  '--diffs-gap-style': '1px solid var(--border)',
  '--diffs-tab-size': '2'
}

const FILE_DIFF_UNSAFE_CSS = `
  :host {
    color: var(--foreground);
  }

  [data-diffs-header] {
    background: color-mix(in srgb, var(--card) 98%, var(--foreground) 2%);
    border-bottom: 1px solid var(--border);
  }

  [data-file-info] {
    background: color-mix(in srgb, var(--secondary) 90%, transparent);
    border-block-color: var(--border);
    color: var(--foreground);
    letter-spacing: -0.01em;
  }

  [data-diffs],
  [data-error-wrapper] {
    background: var(--diffs-bg);
  }

  [data-code] {
    font-family: var(--diffs-font-family);
    font-size: var(--diffs-font-size);
  }

  [data-separator='line-info'] [data-separator-wrapper],
  [data-expand-button],
  [data-separator-content] {
    background: color-mix(in srgb, var(--secondary) 88%, transparent);
    border: 1px solid var(--border);
    box-shadow: none;
  }

  [data-column-number] {
    color: var(--muted-foreground);
  }

  [data-line-type='change-addition'] [data-column-number] {
    color: color-mix(in srgb, var(--accent) 78%, #34c38f 22%);
  }

  [data-line-type='change-deletion'] [data-column-number] {
    color: #ff8b8b;
  }
`

function looksLikePatch(text: string): boolean {
  return (
    text.includes('diff --git') ||
    (text.includes('@@') && text.includes('--- ') && text.includes('+++ ')) ||
    text.startsWith('--- ')
  )
}

function buildSyntheticPatch(item: MessageItem, patch: string): string {
  const trimmed = patch.trim()
  if (!trimmed || !trimmed.includes('@@')) return patch
  if (looksLikePatch(trimmed)) return trimmed

  const filePath = item.filePath || 'file'
  const normalizedPath = filePath.replace(/^\/+/, '')
  const beforePath = item.changeType === 'create' ? '/dev/null' : `a/${normalizedPath}`
  const afterPath = item.changeType === 'delete' ? '/dev/null' : `b/${normalizedPath}`

  return `--- ${beforePath}\n+++ ${afterPath}\n${trimmed}`
}

function parseFileDiffs(item: MessageItem, patch: string): FileDiffMetadata[] {
  const candidatePatch = buildSyntheticPatch(item, patch)
  try {
    return parsePatchFiles(candidatePatch, 'ross-file-change')
      .flatMap((parsedPatch) => parsedPatch.files)
      .filter((fileDiff) => fileDiff.hunks.length > 0)
  } catch (error) {
    console.warn('Failed to parse file change patch for rendering', error)
    return []
  }
}

function getParsedDiffTotals(parsedDiffs: FileDiffMetadata[]): {
  additions: number
  deletions: number
} {
  return parsedDiffs.reduce(
    (totals, fileDiff) => {
      for (const hunk of fileDiff.hunks) {
        totals.additions += hunk.additionCount
        totals.deletions += hunk.deletionCount
      }
      return totals
    },
    { additions: 0, deletions: 0 }
  )
}

function parseJsonLikeText(value: string | undefined): unknown {
  if (!value) return value
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function isLocalAbsolutePath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//')
}

function isExternalUrl(value: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(value)
}

function getImageSource(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (isExternalUrl(trimmed)) return trimmed
  if (isLocalAbsolutePath(trimmed)) {
    return `file://${encodeURI(trimmed)}`
  }
  return null
}

function getDetailText(item: MessageItem): string {
  return item.output || item.resultText || item.content || ''
}

function getUrlsFromText(...values: Array<string | undefined>): string[] {
  const urlPattern = /\bhttps?:\/\/[^\s<>()]+/gi
  const matches = new Set<string>()

  values.forEach((value) => {
    if (!value) return
    const found = value.match(urlPattern) || []
    found.forEach((match) => matches.add(match.replace(/[),.;]+$/, '')))
  })

  return [...matches]
}

function renderToolDetailContent(value: string): ReactElement | null {
  if (!value.trim()) return null

  const parsed = parseJsonLikeText(value)
  if (typeof parsed !== 'string') {
    return <CodeBlock code={JSON.stringify(parsed, null, 2)} language="json" />
  }

  const trimmed = value.trim()
  if (
    looksLikePatch(trimmed) ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    trimmed.includes('\n')
  ) {
    return <CodeBlock code={value} language={looksLikePatch(trimmed) ? 'diff' : 'text'} />
  }

  return (
    <div
      className={`${UI_TEXT_SIZE_CLASS} whitespace-pre-wrap leading-relaxed text-muted-foreground`}
    >
      {value}
    </div>
  )
}

function DetailSection({
  title,
  content
}: {
  title: string
  content?: string
}): ReactElement | null {
  if (!content?.trim()) return null

  return (
    <div className="space-y-1.5">
      <div className="text-ui-10 uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      {renderToolDetailContent(content)}
    </div>
  )
}

function ToolStatusPill({ status }: { status?: string }): ReactElement | null {
  if (!status) return null

  const normalized = status.toLowerCase()
  const tone =
    normalized.includes('fail') || normalized.includes('error')
      ? 'text-red-600 dark:text-red-400 bg-red-500/10'
      : normalized.includes('wait') ||
          normalized.includes('pending') ||
          normalized.includes('request')
        ? 'text-amber-700 dark:text-amber-300 bg-amber-500/10'
        : normalized.includes('complete') ||
            normalized.includes('success') ||
            normalized.includes('supported')
          ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10'
          : 'text-muted-foreground bg-secondary/60'

  return (
    <span className={`rounded-full px-2 py-0.5 text-ui-10 uppercase tracking-[0.14em] ${tone}`}>
      {status}
    </span>
  )
}

function ToolLink({ href, label }: { href: string; label?: string }): ReactElement {
  const defaultOpenDestination = useCodexStore((state) => state.settings.defaultOpenDestination)

  if (isLocalAbsolutePath(href)) {
    return (
      <button
        type="button"
        onClick={() => openLocalPath(href, defaultOpenDestination)}
        className="truncate text-accent underline decoration-accent/60 underline-offset-2 hover:text-foreground transition-colors"
        title={href}
      >
        {label || href}
      </button>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="truncate text-accent underline decoration-accent/60 underline-offset-2 hover:text-foreground transition-colors"
      title={href}
    >
      {label || href}
    </a>
  )
}

function ToolCardFrame({
  item,
  eyebrow,
  title,
  accent,
  secondary,
  children
}: {
  item: MessageItem
  eyebrow: string
  title: ReactElement | string
  accent?: ReactElement | string | null
  secondary?: ReactElement | string | null
  children?: ReactElement | null
}): ReactElement {
  const [open, setOpen] = useState(false)
  const hasBody = Boolean(children)

  return (
    <div className="my-2">
      <button
        type="button"
        onClick={() => hasBody && setOpen((prev) => !prev)}
        disabled={!hasBody}
        className={`group/tool flex w-full items-start justify-between gap-3 rounded-xl px-1 py-1.5 text-left ${
          hasBody ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ui-10 uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </span>
            <ToolStatusPill status={item.status} />
          </div>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <div className="min-w-0 truncate text-[15px] font-medium text-foreground">{title}</div>
            {accent && <div className="text-[14px] font-medium text-accent">{accent}</div>}
          </div>
          {secondary && (
            <div className={`${UI_TEXT_SIZE_CLASS} min-w-0 truncate text-muted-foreground`}>
              {secondary}
            </div>
          )}
        </div>
        {hasBody && (
          <motion.div
            animate={{ rotate: open ? 0 : -90 }}
            transition={{ duration: 0.16, ease: 'easeInOut' }}
            className="shrink-0 pt-1"
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-colors group-hover/tool:text-foreground" />
          </motion.div>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && hasBody && (
          <motion.div
            key={`${item.id}:tool-body`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="ml-[7px] mt-1 space-y-3 border-l border-border/40 pl-4 py-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function WebSearchItem({ item }: { item: MessageItem }): ReactElement {
  const detailText = getDetailText(item)
  const links = useMemo(
    () => getUrlsFromText(item.resultText, item.output, item.argumentsText),
    [item.argumentsText, item.output, item.resultText]
  )

  return (
    <ToolCardFrame
      item={item}
      eyebrow="Web Search"
      title={item.query || 'Search web'}
      secondary={item.summary || item.actionTarget || null}
    >
      <>
        {links.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-ui-10 uppercase tracking-[0.16em] text-muted-foreground">
              Links
            </div>
            <div className="flex flex-col gap-1.5">
              {links.slice(0, 6).map((link) => (
                <ToolLink key={link} href={link} />
              ))}
            </div>
          </div>
        )}
        <DetailSection title="Result" content={detailText} />
        <DetailSection title="Arguments" content={item.argumentsText} />
      </>
    </ToolCardFrame>
  )
}

function ImageViewItem({ item }: { item: MessageItem }): ReactElement {
  const target = item.actionTarget || item.filePath || item.summary || 'Image'
  const imageSrc = getImageSource(target)
  const detailText = getDetailText(item)

  return (
    <ToolCardFrame item={item} eyebrow="Image" title={getBaseName(target)} secondary={target}>
      <>
        {imageSrc && (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-secondary/20">
            <img
              src={imageSrc}
              alt={getBaseName(target)}
              className="max-h-[240px] w-full object-contain bg-background"
            />
          </div>
        )}
        <DetailSection title="Result" content={detailText} />
        <DetailSection title="Arguments" content={item.argumentsText} />
      </>
    </ToolCardFrame>
  )
}

function GenericToolCard({
  item,
  eyebrow,
  title,
  secondary
}: {
  item: MessageItem
  eyebrow: string
  title: string
  secondary?: string
}): ReactElement {
  const detailText = getDetailText(item)

  return (
    <ToolCardFrame
      item={item}
      eyebrow={eyebrow}
      title={title}
      secondary={secondary || item.summary || null}
    >
      <>
        {item.linkedTaskIds && item.linkedTaskIds.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-ui-10 uppercase tracking-[0.16em] text-muted-foreground">
              Linked Tasks
            </div>
            <div className="flex flex-wrap gap-1.5">
              {item.linkedTaskIds.map((taskId) => (
                <span
                  key={taskId}
                  className="rounded-full bg-secondary px-2 py-1 text-ui-11 font-mono text-muted-foreground"
                >
                  {taskId}
                </span>
              ))}
            </div>
          </div>
        )}
        <DetailSection title="Arguments" content={item.argumentsText} />
        <DetailSection title="Result" content={detailText} />
      </>
    </ToolCardFrame>
  )
}

function StateEventItem({ item }: { item: MessageItem }): ReactElement | null {
  const label = getCompactLabel(item)
  const detail = item.summary || item.content || item.output || ''
  if (!label && !detail) return null

  return (
    <div className="my-2 rounded-xl border border-border/60 bg-secondary/25 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ui-10 uppercase tracking-[0.18em] text-muted-foreground">State</span>
        <span className={`${UI_TEXT_SIZE_CLASS} font-medium text-foreground`}>{label}</span>
      </div>
      {detail && (
        <div
          className={`${UI_TEXT_SIZE_CLASS} mt-1.5 whitespace-pre-wrap leading-relaxed text-muted-foreground`}
        >
          {detail}
        </div>
      )}
    </div>
  )
}

function getEditDisplayContent(item: MessageItem): string {
  if (item.type === 'fileChange') {
    return item.content || item.output || ''
  }

  const parsedArguments = parseJsonLikeText(item.argumentsText)
  if (parsedArguments && typeof parsedArguments === 'object' && !Array.isArray(parsedArguments)) {
    const patch =
      typeof (parsedArguments as Record<string, unknown>).patch === 'string'
        ? ((parsedArguments as Record<string, unknown>).patch as string)
        : typeof (parsedArguments as Record<string, unknown>).diff === 'string'
          ? ((parsedArguments as Record<string, unknown>).diff as string)
          : undefined
    if (patch) return patch
  }

  return item.output || item.resultText || item.content || item.argumentsText || ''
}

function FileChangeItem({ item }: { item: MessageItem }): ReactElement {
  const themeModePreference = useCodexStore((state) => state.settings.themeMode)
  const [open, setOpen] = useState(false)
  const fileLabel =
    item.filePath ||
    item.summary ||
    (isEditLikeToolCall(item) ? 'apply_patch' : undefined) ||
    'Edited files'
  const displayContent = getEditDisplayContent(item)
  const parsedDiffs = useMemo(() => parseFileDiffs(item, displayContent), [displayContent, item])
  const totals = useMemo(() => getParsedDiffTotals(parsedDiffs), [parsedDiffs])
  const fallbackLanguage = looksLikePatch(displayContent) ? 'diff' : 'text'
  const resolvedThemeMode = resolveThemeMode(themeModePreference)
  const verb =
    item.changeType === 'create' ? 'Created' : item.changeType === 'delete' ? 'Deleted' : 'Edited'
  const summaryLabel =
    parsedDiffs.length === 1
      ? getBaseName(parsedDiffs[0].name || parsedDiffs[0].prevName || fileLabel)
      : parsedDiffs.length > 1
        ? `${parsedDiffs.length} files`
        : getBaseName(fileLabel)
  const fileDiffOptions = useMemo<NonNullable<FileDiffProps<undefined>['options']>>(
    () => ({
      ...FILE_DIFF_OPTIONS,
      themeType: resolvedThemeMode,
      unsafeCSS: FILE_DIFF_UNSAFE_CSS
    }),
    [resolvedThemeMode]
  )

  return (
    <div className="my-2">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="group/edit flex w-full items-center justify-between gap-3 py-1.5 text-left"
      >
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[15px] font-medium text-muted-foreground">{verb}</span>
          <span className="truncate text-[15px] font-medium text-sky-600 dark:text-sky-400">
            {summaryLabel}
          </span>
          {totals.additions > 0 && (
            <span className="text-[15px] font-semibold text-emerald-600 dark:text-emerald-400">
              +{totals.additions}
            </span>
          )}
          {totals.deletions > 0 && (
            <span className="text-[15px] font-semibold text-red-600 dark:text-red-400">
              -{totals.deletions}
            </span>
          )}
        </div>
        <motion.div
          animate={{ rotate: open ? 0 : -90 }}
          transition={{ duration: 0.16, ease: 'easeInOut' }}
          className="shrink-0"
        >
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-colors group-hover/edit:text-foreground" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="file-change-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-3">
              {parsedDiffs.length > 0
                ? parsedDiffs.map((fileDiff, index) => (
                    <FileDiff
                      key={`${fileDiff.prevName || fileDiff.name || 'diff'}:${index}`}
                      fileDiff={fileDiff}
                      options={fileDiffOptions}
                      className="ross-file-diff overflow-hidden rounded-md border border-border bg-background"
                      style={FILE_DIFF_THEME_STYLE}
                    />
                  ))
                : displayContent && <CodeBlock code={displayContent} language={fallbackLanguage} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MarkdownWithDirectives({
  markdown,
  className
}: {
  markdown: string
  className?: string
}): ReactElement {
  const parsed = useMemo(() => parseAssistantText(markdown), [markdown])

  if (parsed.directives.length === 0) {
    return <MarkdownRenderer markdown={markdown} className={className} />
  }

  return (
    <>
      {parsed.text && <MarkdownRenderer markdown={parsed.text} className={className} />}
      {parsed.directives.map((directive) => (
        <DirectiveCardItem
          key={directive.id}
          directive={directive}
          fallbackContent={directive.source}
        />
      ))}
    </>
  )
}

function ItemRenderer({ item }: { item: MessageItem }): ReactElement | null {
  switch (item.type) {
    case 'agentMessage':
      return <MarkdownWithDirectives markdown={item.content || ''} />

    case 'commandExecution':
      return <CommandExecutionItem item={item} />

    case 'fileChange':
      return <FileChangeItem item={item} />

    case 'reasoning':
      return <ReasoningItem item={item} />

    case 'directive':
      return (
        <DirectiveCardItem
          directive={
            item.directive || {
              id: item.id,
              kind: 'unknown',
              source: item.content,
              attributes: {}
            }
          }
          fallbackContent={item.content}
        />
      )

    case 'taskStatus':
      return <TaskStatusItem item={item} />

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
          <div className={DISCLOSURE_BODY_CLASS}>
            <MarkdownRenderer
              markdown={item.content}
              className="text-muted-foreground leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
            />
          </div>
        </details>
      )

    case 'webSearch':
      return <WebSearchItem item={item} />

    case 'imageView':
      return <ImageViewItem item={item} />

    case 'mcpToolCall':
      return (
        <GenericToolCard
          item={item}
          eyebrow="MCP Tool"
          title={
            item.server ? `${item.server}.${item.toolName || 'tool'}` : item.toolName || 'MCP tool'
          }
          secondary={item.summary}
        />
      )

    case 'dynamicToolCall':
      return (
        <GenericToolCard
          item={item}
          eyebrow="Dynamic Tool"
          title={item.toolName || item.summary || 'Client tool'}
          secondary={item.summary}
        />
      )

    case 'collabToolCall':
      return (
        <GenericToolCard
          item={item}
          eyebrow="Collaboration"
          title={item.summary || item.toolName || 'Collaboration tool'}
          secondary={item.toolName && item.summary !== item.toolName ? item.toolName : undefined}
        />
      )

    case 'contextCompaction':
    case 'enteredReviewMode':
    case 'exitedReviewMode':
      return <StateEventItem item={item} />

    case 'toolCall':
    case 'unknown': {
      if (isEditLikeToolCall(item)) {
        return <FileChangeItem item={item} />
      }

      const label = getCompactLabel(item)
      const hasDetail = Boolean(
        item.argumentsText || item.resultText || item.output || item.content
      )
      if (!label && !hasDetail) return null

      return (
        <div className="my-1 flex items-center gap-2">
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
          <span
            className={`${UI_TEXT_SIZE_CLASS} font-mono truncate ${
              item.completed ? 'text-muted-foreground' : 'text-foreground/80'
            }`}
          >
            {label}
          </span>
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
  'toolCall',
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

function isEditLikeToolCall(item: MessageItem): boolean {
  if (item.type !== 'toolCall') return false
  const toolName = item.toolName?.toLowerCase()
  return Boolean(toolName && (toolName.includes('apply_patch') || toolName.includes('file_change')))
}

function isEditLikeItem(item: MessageItem): boolean {
  return item.type === 'fileChange' || isEditLikeToolCall(item)
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
    case 'toolCall':
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
      case 'toolCall':
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
        <Shimmer
          active={!allCompleted}
          highlightColor="var(--foreground)"
          className={`${UI_TEXT_SIZE_CLASS} text-muted-foreground`}
        >
          {groupLabel}
        </Shimmer>
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
                <div key={item.id} id={`transcript-item-${item.id}`}>
                  <ItemRenderer item={item} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Braille double-helix streaming indicator ─────────────────
const B_EMPTY = 0x2800
const DOT_MAP = [0, 1, 2, 6, 3, 4, 5, 7]

function dotsToChar(dots: number[]): string {
  let code = 0
  for (const d of dots) code |= 1 << d
  return String.fromCharCode(B_EMPTY + code)
}

const HELIX_WIDTH = 4
const PX_W = HELIX_WIDTH * 2
const PX_H = 4

function doubleHelixFrame(t: number): string {
  const grid: boolean[][] = Array.from({ length: PX_H }, () => Array(PX_W).fill(false))
  const p = t * 0.15

  for (let x = 0; x < PX_W; x++) {
    const y1 = Math.round(1.5 + 1.4 * Math.sin(p + x * 0.5))
    const y2 = Math.round(1.5 + 1.4 * Math.sin(-p + x * 0.5 + Math.PI))
    if (y1 >= 0 && y1 < PX_H) grid[y1][x] = true
    if (y2 >= 0 && y2 < PX_H) grid[y2][x] = true
    if (Math.abs(y1 - y2) <= 1) {
      const mid = Math.round((y1 + y2) / 2)
      if (mid >= 0 && mid < PX_H) grid[mid][x] = true
    }
  }

  let result = ''
  for (let cc = 0; cc < HELIX_WIDTH; cc++) {
    const dots: number[] = []
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 2; c++) {
        if (grid[r][cc * 2 + c]) dots.push(DOT_MAP[r * 2 + c])
      }
    }
    result += dotsToChar(dots)
  }
  return result
}

function StreamingDot({ active }: { active: boolean }): ReactElement | null {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setFrame((f) => f + 1), 60)
    return () => clearInterval(id)
  }, [active])

  if (!active) return null

  return (
    <span className="inline-flex items-center ml-1 align-middle font-mono text-[0.85em] leading-none text-foreground/70 select-none">
      {doubleHelixFrame(frame)}
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
        className="mt-1 flex items-center gap-1 text-ui-11 text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded-md"
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
        className="mt-1 flex items-center gap-1 text-ui-11 text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded-md"
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

function Message({ message }: MessageProps): ReactElement {
  const threadDetail = useCodexStore((state) => state.settings.threadDetail)
  const isUser = message.role === 'user'
  const attachments = message.attachments || []
  const itemAgentText = useMemo(
    () =>
      message.items
        .filter((item) => item.type === 'agentMessage')
        .map((item) => item.content)
        .join(''),
    [message.items]
  )
  const assistantText = itemAgentText || message.content
  const groupedSegments = useMemo(
    () =>
      message.items.length > 0 && threadDetail === 'steps_with_code_commands'
        ? groupItems(message.items)
        : [],
    [message.items, threadDetail]
  )
  const assistantOnlyEditSegments = useMemo(
    () =>
      threadDetail === 'assistant_only'
        ? groupItems(message.items.filter((item) => isEditLikeItem(item)))
        : [],
    [message.items, threadDetail]
  )

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
                    className={`inline-flex flex-none items-center justify-center rounded px-1 py-0.5 text-ui-9 font-bold tracking-wider leading-none ${getExtensionColor(attachment.name, attachment.kind)}`}
                  >
                    {getDisplayExtension(attachment.name, attachment.kind)}
                  </span>
                  <span className="truncate text-ui-12 font-medium text-muted-foreground font-mono">
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
          {groupedSegments.length > 0 ? (
            groupedSegments.map((segment) =>
              segment.kind === 'group' ? (
                <ToolCallGroup key={segment.items[0].id} items={segment.items} />
              ) : (
                <div key={segment.item.id} id={`transcript-item-${segment.item.id}`}>
                  <ItemRenderer item={segment.item} />
                </div>
              )
            )
          ) : (
            <>
              <MarkdownWithDirectives markdown={assistantText} />
              {assistantOnlyEditSegments.length > 0 && (
                <div className="pt-2 space-y-2">
                  {assistantOnlyEditSegments.map((segment) =>
                    segment.kind === 'group' ? (
                      <ToolCallGroup key={segment.items[0].id} items={segment.items} />
                    ) : (
                      <div key={segment.item.id} id={`transcript-item-${segment.item.id}`}>
                        <ItemRenderer item={segment.item} />
                      </div>
                    )
                  )}
                </div>
              )}
            </>
          )}
          <StreamingDot active={message.isStreaming} />
          {assistantText && !message.isStreaming && <AssistantCopyButton text={assistantText} />}
        </div>
      )}
    </motion.div>
  )
}

export default memo(Message)

export { WorkDivider, TerminalOutput, InlineCode }
