import { useState, type ReactElement } from 'react'
import { ScrollText } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { ANIMATION_EASE } from '@/lib/animations'
import { useCodexStore } from '@/lib/store'
import GitModal from '@/components/git-modal'

const headerFade = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: { duration: 0.18, ease: ANIMATION_EASE }
}

export default function Header(): ReactElement {
  const {
    threads,
    activeThreadId,
    activeTab,
    isSidebarOpen,
    setPlanSheetOpen,
    setIsSidebarOpen
  } = useCodexStore()
  const [gitModalOpen, setGitModalOpen] = useState(false)

  const activeThread = threads.find((t) => t.id === activeThreadId)
  const isSkillsTab = activeTab === 'skills'

  const hasPlanItems =
    activeThread?.messages.some((m) => m.items.some((item) => item.type === 'plan')) ?? false

  return (
    <header
      className={`h-11 flex items-center justify-between px-3 drag-region shrink-0 select-none ${!isSidebarOpen ? 'pl-[80px]' : ''}`}
    >
      {/* Left: sidebar toggle + thread info */}
      <div className="flex items-center gap-2 min-w-0">
        <AnimatePresence>
          {!isSidebarOpen && (
            <motion.button
              key="sidebar-toggle"
              {...headerFade}
              onClick={() => setIsSidebarOpen(true)}
              className="no-drag p-1 rounded-md hover:bg-secondary transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-4 h-4 text-muted-foreground"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          {isSkillsTab ? (
            <motion.div
              key="skills-header"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={{ duration: 0.2, ease: ANIMATION_EASE }}
              className="flex items-center gap-2 min-w-0"
            >
              <span className="text-ui-13 font-medium truncate">Skills</span>
              <span className="text-ui-12 text-muted-foreground shrink-0">Workspace</span>
            </motion.div>
          ) : (
            <motion.div
              key="thread-header"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={{ duration: 0.2, ease: ANIMATION_EASE }}
              className="flex items-center gap-2 min-w-0"
            >
              <span className="text-ui-13 font-medium truncate">
                {activeThread ? activeThread.title : 'New thread'}
              </span>
              {activeThread && (
                <>
                  <span className="text-ui-12 text-muted-foreground shrink-0">
                    {activeThread.project}
                  </span>
                  <button className="no-drag p-0.5 hover:bg-secondary rounded transition-colors shrink-0">
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-3.5 h-3.5 text-muted-foreground"
                    >
                      <circle cx="12" cy="5" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-1 no-drag shrink-0">
        <AnimatePresence mode="wait">
          {isSkillsTab ? (
            <motion.span
              key="skills-badge"
              {...headerFade}
              className="px-2 py-1 text-ui-11 border border-border rounded-md text-muted-foreground"
            >
              Loaded from Codex
            </motion.span>
          ) : (
            <motion.div
              key="thread-actions"
              {...headerFade}
              className="flex items-center gap-1"
            >
              <AnimatePresence>
                {hasPlanItems && (
                  <motion.button
                    key="plans-btn"
                    {...headerFade}
                    onClick={() => setPlanSheetOpen(true)}
                    className="flex items-center gap-1.5 px-2 py-1 text-ui-12 text-foreground border border-border rounded-md hover:bg-secondary transition-colors"
                  >
                    <ScrollText className="w-3 h-3" />
                    Plans
                  </motion.button>
                )}
              </AnimatePresence>
              {/* Commit */}
              <button
                onClick={() => setGitModalOpen(true)}
                className="flex items-center gap-1 px-2 py-1 text-ui-12 text-foreground border border-border rounded-md hover:bg-secondary transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-3 h-3"
                >
                  <circle cx="12" cy="12" r="4" />
                  <line x1="1.05" y1="12" x2="7" y2="12" />
                  <line x1="17.01" y1="12" x2="22.96" y2="12" />
                </svg>
                Commit
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-2.5 h-2.5 text-muted-foreground"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <GitModal open={gitModalOpen} onClose={() => setGitModalOpen(false)} />
    </header>
  )
}
