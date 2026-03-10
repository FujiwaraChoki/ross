import { useState, type ReactElement } from 'react'
import { ScrollText } from 'lucide-react'
import { useCodexStore } from '@/lib/store'
import GitModal from '@/components/git-modal'

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
        {!isSidebarOpen && (
          <button
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
          </button>
        )}
        {isSkillsTab && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-ui-13 font-medium truncate">Skills</span>
            <span className="text-ui-12 text-muted-foreground shrink-0">Workspace</span>
          </div>
        )}
        {!isSkillsTab && (
          <div className="flex items-center gap-2 min-w-0">
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
          </div>
        )}
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-1 no-drag shrink-0">
        {isSkillsTab && (
          <span className="px-2 py-1 text-ui-11 border border-border rounded-md text-muted-foreground">
            Loaded from Codex
          </span>
        )}
        {!isSkillsTab && (
          <>
            {hasPlanItems && (
              <button
                onClick={() => setPlanSheetOpen(true)}
                className="flex items-center gap-1.5 px-2 py-1 text-ui-12 text-foreground border border-border rounded-md hover:bg-secondary transition-colors"
              >
                <ScrollText className="w-3 h-3" />
                Plans
              </button>
            )}
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
          </>
        )}
      </div>

      <GitModal open={gitModalOpen} onClose={() => setGitModalOpen(false)} />
    </header>
  )
}
