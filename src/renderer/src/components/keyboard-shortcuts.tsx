import { useEffect, type ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Keyboard } from 'lucide-react'
import { ANIMATION_EASE } from '@/lib/animations'

interface ShortcutEntry {
  keys: string[]
  label: string
}

interface ShortcutGroup {
  title: string
  shortcuts: ShortcutEntry[]
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'General',
    shortcuts: [
      { keys: ['\u2318', 'K'], label: 'Command palette' },
      { keys: ['\u2318', 'B'], label: 'Toggle sidebar' },
      { keys: ['\u2318', ','], label: 'Settings' },
      { keys: ['\u2318', 'N'], label: 'New thread' },
      { keys: ['\u2318', 'O'], label: 'Open project' },
      { keys: ['\u2318', '/'], label: 'Keyboard shortcuts' }
    ]
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['\u21E7', '\u2318', '['], label: 'Previous thread' },
      { keys: ['\u21E7', '\u2318', ']'], label: 'Next thread' },
      { keys: ['\u2318', 'F'], label: 'Focus input' }
    ]
  },
  {
    title: 'Editing',
    shortcuts: [
      { keys: ['\u2318', '\u21A9'], label: 'Send message' },
      { keys: ['\u21E7', '\u2318', 'P'], label: 'Toggle plan mode' },
      { keys: ['Esc'], label: 'Stop / close' }
    ]
  },
  {
    title: 'View',
    shortcuts: [
      { keys: ['\u2318', '='], label: 'Increase font size' },
      { keys: ['\u2318', '-'], label: 'Decrease font size' },
      { keys: ['\u2318', '0'], label: 'Reset font size' }
    ]
  }
]

interface KeyboardShortcutsProps {
  open: boolean
  onClose: () => void
}

export default function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps): ReactElement {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: ANIMATION_EASE }}
            className="w-full max-w-[480px] mx-4 rounded-2xl border border-border bg-background p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
                  <Keyboard className="w-4 h-4 text-foreground" strokeWidth={1.75} />
                </div>
                <h2 className="text-ui-17 font-semibold text-foreground">Keyboard shortcuts</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1 -m-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="w-4 h-4"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="space-y-5">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title}>
                  <h3 className="text-ui-12 font-medium text-muted-foreground mb-2">
                    {group.title}
                  </h3>
                  <div className="space-y-0.5">
                    {group.shortcuts.map((shortcut) => (
                      <div
                        key={shortcut.label}
                        className="flex items-center justify-between py-1.5 px-1"
                      >
                        <span className="text-ui-13 text-foreground">{shortcut.label}</span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, i) => (
                            <kbd key={i} className="cmdk-shortcut">
                              {key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
