import { useState, type ReactElement } from 'react'
import { motion } from 'framer-motion'
import { ANIMATION_EASE } from '@/lib/animations'

interface LoginScreenProps {
  onLogin: () => Promise<void>
}

export default function LoginScreen({ onLogin }: LoginScreenProps): ReactElement {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      await onLogin()
    } catch {
      setError('Authentication failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-background drag-region">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: ANIMATION_EASE }}
        className="flex flex-col items-center gap-8 no-drag"
      >
        <div className="flex flex-col items-center gap-3">
          <img src="./logo.png" alt="Ross" className="w-14 h-14 rounded-2xl" />
          <h1 className="text-xl font-medium text-foreground">Ross</h1>
          <p className="text-[13px] text-muted-foreground">Desktop Codex client</p>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="px-6 py-2.5 bg-foreground text-background rounded-lg text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="opacity-20"
                />
                <path
                  d="M4 12a8 8 0 018-8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              Signing in...
            </span>
          ) : (
            'Sign in with ChatGPT'
          )}
        </button>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[13px] text-red-500/80"
          >
            {error}
          </motion.p>
        )}
      </motion.div>
    </div>
  )
}
