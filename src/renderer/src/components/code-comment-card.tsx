import type { ReactElement } from 'react'
import { motion } from 'framer-motion'
import { ANIMATION_EASE } from '@/lib/animations'
import { useCodexStore, type DirectiveCard, type OpenDestination } from '@/lib/store'

function openLocalPath(path: string, editor: OpenDestination): void {
  void window.codex.openFileLink({ href: path, editor }).catch((error) => {
    console.error('Failed to open linked file', error)
  })
}

function fileName(filePath: string): string {
  return filePath.split('/').pop() || filePath
}

const PRIORITY_DOT: Record<number, string> = {
  1: 'bg-red-400',
  2: 'bg-amber-400',
  3: 'bg-blue-400'
}

export default function CodeCommentCard({ directive }: { directive: DirectiveCard }): ReactElement {
  const defaultOpenDestination = useCodexStore((s) => s.settings.defaultOpenDestination)

  const priority = directive.priority ?? 0
  const dotColor = PRIORITY_DOT[priority] || 'bg-muted-foreground/40'
  const title = directive.title?.replace(/^\[P\d+\]\s*/, '') || 'Code comment'
  const lineRef = directive.start
    ? `:${directive.start}${directive.end ? `-${directive.end}` : ''}`
    : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: ANIMATION_EASE }}
      className="my-2.5 rounded-md bg-secondary/40 px-3 py-2.5"
    >
      <div className="flex items-start gap-2">
        <span className={`mt-[7px] shrink-0 h-[7px] w-[7px] rounded-full ${dotColor}`} />
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-medium leading-snug text-foreground">{title}</span>
          {directive.filePath && (
            <span className="ml-2 text-[11px] font-mono text-muted-foreground/50">
              {fileName(directive.filePath)}
              {lineRef}
            </span>
          )}
        </div>
      </div>

      {directive.body && (
        <p className="mt-1.5 ml-[15px] text-[12.5px] leading-[1.6] text-muted-foreground">
          {directive.body}
        </p>
      )}

      {directive.filePath && (
        <button
          type="button"
          onClick={() => openLocalPath(directive.filePath!, defaultOpenDestination)}
          className="mt-2 ml-[15px] text-[11px] font-mono text-accent/70 hover:text-accent transition-colors"
        >
          {directive.filePath}
          {lineRef}
        </button>
      )}
    </motion.div>
  )
}
