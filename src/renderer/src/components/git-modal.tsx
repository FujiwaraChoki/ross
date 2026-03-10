import { useState, useEffect, useCallback, type ReactElement, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { ANIMATION_EASE } from '@/lib/animations'
import { Switch } from '@/components/ui/switch'
import { useCodexStore } from '@/lib/store'

type NextStep = 'commit' | 'commit-push' | 'commit-pr'

interface GitStatus {
  branch: string
  filesChanged: number
  additions: number
  deletions: number
}

interface GitModalProps {
  open: boolean
  onClose: () => void
}

export default function GitModal({ open, onClose }: GitModalProps): ReactElement {
  const { activeProject } = useCodexStore()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [commitMessage, setCommitMessage] = useState('')
  const [includeUnstaged, setIncludeUnstaged] = useState(true)
  const [nextStep, setNextStep] = useState<NextStep>('commit')
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.codex.gitStatus({ cwd: activeProject?.path })
      setStatus(result)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [activeProject?.path])

  useEffect(() => {
    if (open) {
      fetchStatus()
      setCommitMessage('')
      setNextStep('commit')
      setCommitting(false)
    }
  }, [open, fetchStatus])

  const handleCommit = async (): Promise<void> => {
    setCommitting(true)
    setError(null)
    try {
      const result = await window.codex.gitCommit({
        message: commitMessage,
        includeUnstaged,
        push: nextStep === 'commit-push' || nextStep === 'commit-pr',
        createPr: nextStep === 'commit-pr',
        cwd: activeProject?.path
      })
      if (result.success) {
        if (result.error) {
          setError(result.error)
        } else {
          toast.success('Changes committed')
          onClose()
        }
      } else {
        const msg = result.error || 'Commit failed'
        toast.error(msg)
        setError(msg)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCommitting(false)
    }
  }

  const steps: { value: NextStep; label: string; icon: ReactNode; disabled?: boolean }[] = [
    {
      value: 'commit',
      label: 'Commit',
      icon: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="w-4 h-4"
        >
          <circle cx="12" cy="12" r="4" />
          <line x1="1.05" y1="12" x2="7" y2="12" />
          <line x1="17.01" y1="12" x2="22.96" y2="12" />
        </svg>
      )
    },
    {
      value: 'commit-push',
      label: 'Commit and push',
      icon: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
        >
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      )
    },
    {
      value: 'commit-pr',
      label: 'Commit and create PR',
      icon: (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
        </svg>
      ),
      disabled: status?.branch === 'main' || status?.branch === 'master'
    }
  ]

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
            className="w-full max-w-[420px] mx-4 rounded-2xl border border-border bg-background p-6 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-4 h-4 text-foreground"
                >
                  <circle cx="12" cy="12" r="4" />
                  <line x1="1.05" y1="12" x2="7" y2="12" />
                  <line x1="17.01" y1="12" x2="22.96" y2="12" />
                </svg>
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

            <h2 className="text-ui-17 font-semibold text-foreground mb-5">Commit your changes</h2>

            {loading ? (
              <div className="py-8 text-center text-ui-13 text-muted-foreground">
                Loading git status...
              </div>
            ) : (
              <>
                {/* Branch */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-ui-13 font-medium text-foreground">Branch</span>
                  <div className="flex items-center gap-1.5 text-ui-13 text-muted-foreground">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-3.5 h-3.5"
                    >
                      <line x1="6" y1="3" x2="6" y2="15" />
                      <circle cx="18" cy="6" r="3" />
                      <circle cx="6" cy="18" r="3" />
                      <path d="M18 9a9 9 0 01-9 9" />
                    </svg>
                    {status?.branch || 'unknown'}
                  </div>
                </div>

                {/* Changes */}
                <div className="flex items-center justify-between py-2 mb-1">
                  <span className="text-ui-13 font-medium text-foreground">Changes</span>
                  <div className="flex items-center gap-2 text-ui-13">
                    <span className="text-muted-foreground">
                      {status?.filesChanged || 0} file{(status?.filesChanged || 0) !== 1 ? 's' : ''}
                    </span>
                    <span className="text-green-500">+{status?.additions || 0}</span>
                    <span className="text-red-400">-{status?.deletions || 0}</span>
                  </div>
                </div>

                {/* Include unstaged toggle */}
                <div className="flex items-center gap-2.5 py-2 mb-4">
                  <Switch
                    checked={includeUnstaged}
                    onCheckedChange={setIncludeUnstaged}
                    size="sm"
                  />
                  <span className="text-ui-13 text-foreground">Include unstaged</span>
                </div>

                {/* Commit message */}
                <div className="mb-5">
                  <label className="block text-ui-13 font-medium text-foreground mb-2">
                    Commit message
                  </label>
                  <textarea
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Leave blank to autogenerate a commit message"
                    rows={3}
                    className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-ui-13 text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-ring transition-colors"
                  />
                </div>

                {/* Next steps */}
                <div className="mb-5">
                  <span className="block text-ui-13 font-medium text-foreground mb-2">
                    Next steps
                  </span>
                  <div className="flex flex-col gap-1">
                    {steps.map((step) => (
                      <button
                        key={step.value}
                        onClick={() => !step.disabled && setNextStep(step.value)}
                        disabled={step.disabled}
                        className={`
                          flex items-center gap-3 px-3 py-2.5 rounded-lg text-ui-13 transition-colors text-left
                          ${step.disabled ? 'opacity-40 cursor-not-allowed' : ''}
                          ${
                            nextStep === step.value
                              ? 'bg-secondary text-foreground'
                              : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                          }
                        `}
                      >
                        <span className="shrink-0 opacity-70">{step.icon}</span>
                        <span className="flex-1">{step.label}</span>
                        {nextStep === step.value && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ duration: 0.15, ease: ANIMATION_EASE }}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="w-4 h-4 text-foreground"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </motion.div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-ui-12 text-red-400"
                  >
                    {error}
                  </motion.div>
                )}

                {/* Continue button */}
                <button
                  onClick={handleCommit}
                  disabled={committing || status?.filesChanged === 0}
                  className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-ui-13 font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {committing ? 'Working...' : 'Continue'}
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
