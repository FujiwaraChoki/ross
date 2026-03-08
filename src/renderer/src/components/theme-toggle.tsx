import { useEffect, useState, useSyncExternalStore, useCallback, type ReactElement } from 'react'
import { motion } from 'framer-motion'

type Theme = 'light' | 'dark' | 'system'

const applyTheme = (newTheme: Theme): void => {
  const root = document.documentElement
  if (newTheme === 'system') {
    root.removeAttribute('data-theme')
    root.classList.remove('dark', 'light')
  } else {
    root.setAttribute('data-theme', newTheme)
    root.classList.remove('dark', 'light')
    root.classList.add(newTheme)
  }
}

const getStoredTheme = (): Theme => {
  return (localStorage.getItem('theme') as Theme) || 'system'
}

const subscribe = (callback: () => void): (() => void) => {
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}

export default function ThemeToggle(): ReactElement | null {
  const storedTheme = useSyncExternalStore(subscribe, getStoredTheme, (): Theme => 'system')
  const [theme, setTheme] = useState<Theme>(storedTheme)
  const mounted = useSyncExternalStore(
    useCallback(() => () => {}, []),
    () => true,
    () => false
  )

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const cycleTheme = (): void => {
    const next: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(next)
    localStorage.setItem('theme', next)
    applyTheme(next)
  }

  if (!mounted) return null

  const ease = [0.22, 1, 0.36, 1] as const

  return (
    <button
      onClick={cycleTheme}
      className="p-2 rounded-lg bg-secondary border border-border hover:border-ring transition-colors"
      aria-label={`Current theme: ${theme}. Click to cycle.`}
    >
      <div className="relative w-4 h-4">
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute inset-0 w-4 h-4 text-muted-foreground"
          initial={false}
          animate={{
            scale: theme === 'light' ? 1 : 0,
            opacity: theme === 'light' ? 1 : 0,
            rotate: theme === 'light' ? 0 : -90
          }}
          transition={{ duration: 0.25, ease }}
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </motion.svg>

        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute inset-0 w-4 h-4 text-muted-foreground"
          initial={false}
          animate={{
            scale: theme === 'dark' ? 1 : 0,
            opacity: theme === 'dark' ? 1 : 0,
            rotate: theme === 'dark' ? 0 : 90
          }}
          transition={{ duration: 0.25, ease }}
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </motion.svg>

        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute inset-0 w-4 h-4 text-muted-foreground"
          initial={false}
          animate={{
            scale: theme === 'system' ? 1 : 0,
            opacity: theme === 'system' ? 1 : 0,
            rotate: theme === 'system' ? 0 : 90
          }}
          transition={{ duration: 0.25, ease }}
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </motion.svg>
      </div>
    </button>
  )
}
