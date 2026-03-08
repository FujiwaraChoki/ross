import { type ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ANIMATION_EASE } from '@/lib/animations'

interface ApprovalDialogProps {
  title: string
  description: string
  details?: string
  onApprove: () => void
  onReject: () => void
}

export default function ApprovalDialog({
  title,
  description,
  details,
  onApprove,
  onReject
}: ApprovalDialogProps): ReactElement {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 6 }}
          transition={{ duration: 0.2, ease: ANIMATION_EASE }}
          className="w-full max-w-md mx-4 rounded-xl border border-border bg-background p-5 shadow-lg"
        >
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground tracking-wide mb-2.5">
                {title}
              </p>
              <p className="text-[13px] text-foreground/70 mb-3">{description}</p>
              {details && (
                <div className="rounded-md bg-terminal-bg border border-border p-3">
                  <code className="text-[13px] text-foreground font-mono whitespace-pre-wrap break-all">
                    {details}
                  </code>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={onReject}
                className="px-4 py-1.5 text-[13px] text-muted-foreground hover:text-foreground rounded-md border border-border hover:bg-secondary transition-colors"
              >
                Deny
              </button>
              <button
                onClick={onApprove}
                className="px-4 py-1.5 text-[13px] bg-accent text-accent-foreground rounded-md font-medium hover:opacity-90 transition-opacity"
              >
                Allow
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
