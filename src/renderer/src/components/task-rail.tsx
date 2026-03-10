import { useMemo, useState, type ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useCodexStore, type TaskCard, timeAgo } from '@/lib/store'

const UI_TEXT_SIZE_CLASS = 'text-[14px]'

function formatStatus(task: TaskCard): string {
  switch (task.status) {
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

function getTaskAccent(task: TaskCard): string {
  switch (task.status) {
    case 'completed':
      return 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
    case 'failed':
      return 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
    case 'running':
      return 'bg-sky-500/12 text-sky-600 dark:text-sky-400'
    case 'waiting':
      return 'bg-amber-500/12 text-amber-600 dark:text-amber-400'
    default:
      return 'bg-secondary text-muted-foreground'
  }
}

function scrollToTranscript(task: TaskCard): void {
  const itemId = task.linkedTranscriptItemIds[0]
  if (!itemId) return

  document.getElementById(`transcript-item-${itemId}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  })
}

function TaskCardView({ task }: { task: TaskCard }): ReactElement {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-w-[220px] max-w-[280px] rounded-2xl border border-border/70 bg-card/85 px-3 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.06)]">
      <button type="button" onClick={() => setOpen((prev) => !prev)} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-ui-10 uppercase tracking-[0.14em] ${getTaskAccent(task)}`}
              >
                {formatStatus(task)}
              </span>
              {task.startedAt && (
                <span className="text-ui-10 uppercase tracking-[0.14em] text-muted-foreground">
                  {timeAgo(task.startedAt)}
                </span>
              )}
            </div>
            <div className={`${UI_TEXT_SIZE_CLASS} mt-2 truncate font-medium text-foreground`}>
              {task.nickname || task.title}
            </div>
            {task.summary && (
              <div className={`${UI_TEXT_SIZE_CLASS} mt-1 line-clamp-2 text-muted-foreground`}>
                {task.summary}
              </div>
            )}
          </div>
          <motion.div
            animate={{ rotate: open ? 0 : -90 }}
            transition={{ duration: 0.15, ease: 'easeInOut' }}
            className="shrink-0"
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
              {task.lastMessage && (
                <div
                  className={`${UI_TEXT_SIZE_CLASS} whitespace-pre-wrap leading-relaxed text-muted-foreground`}
                >
                  {task.lastMessage}
                </div>
              )}
              {task.results.length > 0 && !task.lastMessage && (
                <div
                  className={`${UI_TEXT_SIZE_CLASS} whitespace-pre-wrap leading-relaxed text-muted-foreground`}
                >
                  {task.results[task.results.length - 1]}
                </div>
              )}
              {task.linkedCallIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {task.linkedCallIds.slice(0, 2).map((callId) => (
                    <span
                      key={callId}
                      className="rounded-full bg-secondary px-2 py-1 text-ui-10 font-mono text-muted-foreground"
                    >
                      {callId}
                    </span>
                  ))}
                </div>
              )}
              {task.linkedTranscriptItemIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => scrollToTranscript(task)}
                  className="text-ui-11 text-accent transition-colors hover:text-foreground"
                >
                  Jump to transcript
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function TaskRail(): ReactElement | null {
  const activeThreadId = useCodexStore((state) => state.activeThreadId)
  const tasksByThreadId = useCodexStore((state) => state.tasksByThreadId)

  const tasks = useMemo(() => {
    if (!activeThreadId) return []
    return [...(tasksByThreadId[activeThreadId] || [])].sort((left, right) => {
      const leftTime = left.completedAt || left.startedAt || 0
      const rightTime = right.completedAt || right.startedAt || 0
      return rightTime - leftTime
    })
  }, [activeThreadId, tasksByThreadId])

  if (tasks.length === 0) return null

  return (
    <div className="border-t border-border/60 bg-background/70 px-6 py-3 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-ui-10 uppercase tracking-[0.2em] text-muted-foreground">
            Background Work
          </span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-ui-10 text-muted-foreground">
            {tasks.length}
          </span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {tasks.map((task) => (
            <TaskCardView key={task.id} task={task} />
          ))}
        </div>
      </div>
    </div>
  )
}
