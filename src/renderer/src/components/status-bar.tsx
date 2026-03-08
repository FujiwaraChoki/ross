import type { ReactElement } from 'react'
import { useCodexStore } from '@/lib/store'

export default function StatusBar(): ReactElement {
  const { activeProject } = useCodexStore()

  return (
    <div className="h-6 flex items-center justify-between px-3 border-t border-border bg-background text-[11px] text-muted-foreground shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3">
        {/* Project */}
        <button
          onClick={() => {
            if (activeProject?.path) {
              window.codex.revealInFinder(activeProject.path)
            }
          }}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3 h-3"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          {activeProject?.name || 'Local'}
        </button>

        {/* Full access */}
        <button className="flex items-center gap-1 hover:text-foreground transition-colors">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3 h-3 text-green-500"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className="text-green-600">Full access</span>
        </button>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Git branch */}
        <button className="flex items-center gap-1 hover:text-foreground transition-colors">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3 h-3"
          >
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 01-9 9" />
          </svg>
          main
        </button>

        {/* Terminal */}
        <button className="flex items-center gap-1 hover:text-foreground transition-colors">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3 h-3"
          >
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </button>
      </div>
    </div>
  )
}
