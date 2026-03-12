import { useEffect, useState, useCallback, useRef, type ReactElement } from 'react'
import { Command } from 'cmdk'
import { AnimatePresence, motion } from 'framer-motion'
import { ANIMATION_EASE } from '@/lib/animations'
import {
  SquarePen,
  FolderOpen,
  Settings,
  ArrowUp,
  ArrowDown,
  Search,
  ArrowLeft,
  Keyboard,
  Palette,
  Sun,
  Moon,
  Monitor,
  Check,
  ChevronRight
} from 'lucide-react'
import { useCodexStore, type AppSettings } from '@/lib/store'
import { getThemeFontOverrides } from '../../../shared/theme'
import { applyUiPreferences } from '@/lib/ui-preferences'
import type { ThemePreference } from '../../../shared/theme'

type Page = 'root' | 'theme'

export default function CommandBar(): ReactElement {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<Page>('root')
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    threads,
    activeThreadId,
    activeProject,
    setActiveThread,
    setActiveTab,
    setActiveProject,
    createThread,
    recentProjects,
    themes,
    settings,
    updateSettings
  } = useCodexStore()

  const settingsSnapshotRef = useRef<AppSettings | null>(null)

  const previewTheme = useCallback(
    (overrides: Partial<AppSettings>) => {
      if (!settingsSnapshotRef.current) return
      const preview = { ...settingsSnapshotRef.current, ...overrides }
      const previewThemeEntry = themes.find((t) => t.id === preview.themeId)
      applyUiPreferences(preview, previewThemeEntry)
    },
    [themes]
  )

  const restoreTheme = useCallback(() => {
    if (!settingsSnapshotRef.current) return
    const original = settingsSnapshotRef.current
    const originalTheme = themes.find((t) => t.id === original.themeId)
    applyUiPreferences(original, originalTheme)
  }, [themes])

  const close = useCallback(() => {
    restoreTheme()
    settingsSnapshotRef.current = null
    setPage('root')
    setSearch('')
    setOpen(false)
  }, [restoreTheme])

  const goBack = useCallback(() => {
    restoreTheme()
    setPage('root')
    setSearch('')
  }, [restoreTheme])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => {
          if (!prev) {
            settingsSnapshotRef.current = { ...useCodexStore.getState().settings }
          } else {
            restoreTheme()
            settingsSnapshotRef.current = null
          }
          return !prev
        })
        setPage('root')
        setSearch('')
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        if (page !== 'root') {
          goBack()
        } else {
          close()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, page, close, goBack, restoreTheme])

  const handleNewThread = useCallback(async () => {
    close()
    const projectPath = activeProject?.path
    let id: string = crypto.randomUUID()
    try {
      const result = await window.codex.threadStart({ cwd: projectPath })
      const thread = result as { thread?: { id?: string } } | undefined
      const serverId = thread?.thread?.id
      if (typeof serverId === 'string' && serverId) id = serverId
    } catch (err) {
      console.error('Failed to start thread:', err)
    }
    createThread(id, undefined, activeProject?.name, projectPath)
    setActiveTab('threads')
  }, [activeProject, createThread, setActiveTab, close])

  const handleOpenFolder = useCallback(async () => {
    close()
    try {
      const result = await window.codex.openProject()
      if (result) {
        const { path, name } = result as { path: string; name: string }
        setActiveProject({ path, name })
      }
    } catch (err) {
      console.error('Failed to open folder:', err)
    }
  }, [setActiveProject, close])

  const handleSettings = useCallback(() => {
    close()
    setActiveTab('settings')
  }, [setActiveTab, close])

  const handlePreviousThread = useCallback(() => {
    close()
    const nonArchived = threads.filter((t) => !t.archived)
    if (nonArchived.length === 0) return
    const currentIndex = nonArchived.findIndex((t) => t.id === activeThreadId)
    const prevIndex = currentIndex <= 0 ? nonArchived.length - 1 : currentIndex - 1
    setActiveThread(nonArchived[prevIndex].id)
    setActiveTab('threads')
  }, [threads, activeThreadId, setActiveThread, setActiveTab, close])

  const handleNextThread = useCallback(() => {
    close()
    const nonArchived = threads.filter((t) => !t.archived)
    if (nonArchived.length === 0) return
    const currentIndex = nonArchived.findIndex((t) => t.id === activeThreadId)
    const nextIndex = currentIndex >= nonArchived.length - 1 ? 0 : currentIndex + 1
    setActiveThread(nonArchived[nextIndex].id)
    setActiveTab('threads')
  }, [threads, activeThreadId, setActiveThread, setActiveTab, close])

  const handleFind = useCallback(() => {
    close()
    // Focus the chat input as a "find" action
    const input = document.querySelector<HTMLTextAreaElement>('[data-chat-input]')
    input?.focus()
  }, [close])

  const handleBack = useCallback(() => {
    close()
    setActiveTab('threads')
  }, [setActiveTab, close])

  const handleSwitchThread = useCallback(
    (threadId: string) => {
      close()
      const thread = threads.find((t) => t.id === threadId)
      if (!thread) return
      setActiveThread(threadId)
      if (thread.projectPath) {
        setActiveProject({ name: thread.project, path: thread.projectPath })
      } else {
        const matchingProject = recentProjects.find((p) => p.name === thread.project)
        if (matchingProject) setActiveProject(matchingProject)
      }
      setActiveTab('threads')
    },
    [threads, recentProjects, setActiveThread, setActiveProject, setActiveTab, close]
  )

  const openThemePage = useCallback(() => {
    settingsSnapshotRef.current = { ...useCodexStore.getState().settings }
    setSearch('')
    setPage('theme')
  }, [])

  if (!open) return <></>

  const nonArchivedThreads = threads.filter((t) => !t.archived)

  return (
    <div className="cmdk-overlay" onClick={close}>
      <div className="cmdk-wrapper" onClick={(e) => e.stopPropagation()}>
        <Command
          className="cmdk-root"
          loop
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !search && page !== 'root') {
              e.preventDefault()
              goBack()
            }
          }}
        >
          <div className="cmdk-input-wrapper">
            <AnimatePresence>
              {page !== 'root' && (
                <motion.button
                  initial={{ opacity: 0, x: -8, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -8, scale: 0.95 }}
                  transition={{ duration: 0.18, ease: ANIMATION_EASE }}
                  onClick={goBack}
                  className="cmdk-breadcrumb"
                >
                  <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
                  <span>Theme</span>
                </motion.button>
              )}
            </AnimatePresence>
            <Command.Input
              ref={inputRef}
              value={search}
              onValueChange={setSearch}
              placeholder={page === 'theme' ? 'Search themes...' : 'Search commands...'}
              className="cmdk-input"
              autoFocus
            />
          </div>
          <Command.List className="cmdk-list">
            <Command.Empty className="cmdk-empty">No results found.</Command.Empty>

            {page === 'root' && (
              <>
                <Command.Group heading="Suggested" className="cmdk-group">
                  <Command.Item onSelect={() => void handleNewThread()} className="cmdk-item">
                    <SquarePen className="cmdk-icon" strokeWidth={1.75} />
                    <span>New thread</span>
                    <kbd className="cmdk-shortcut">
                      <span>&#8984;</span>N
                    </kbd>
                  </Command.Item>
                  <Command.Item onSelect={() => void handleOpenFolder()} className="cmdk-item">
                    <FolderOpen className="cmdk-icon" strokeWidth={1.75} />
                    <span>Open folder</span>
                    <kbd className="cmdk-shortcut">
                      <span>&#8984;</span>O
                    </kbd>
                  </Command.Item>
                  <Command.Item onSelect={handleSettings} className="cmdk-item">
                    <Settings className="cmdk-icon" strokeWidth={1.75} />
                    <span>Settings</span>
                    <kbd className="cmdk-shortcut">
                      <span>&#8984;</span>,
                    </kbd>
                  </Command.Item>
                  <Command.Item onSelect={openThemePage} className="cmdk-item">
                    <Palette className="cmdk-icon" strokeWidth={1.75} />
                    <span>Select theme</span>
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                  </Command.Item>
                  <Command.Item
                    onSelect={() => {
                      close()
                      window.dispatchEvent(
                        new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true })
                      )
                    }}
                    className="cmdk-item"
                  >
                    <Keyboard className="cmdk-icon" strokeWidth={1.75} />
                    <span>Keyboard shortcuts</span>
                    <kbd className="cmdk-shortcut">
                      <span>&#8984;</span>/
                    </kbd>
                  </Command.Item>
                </Command.Group>

                <Command.Group heading="Navigation" className="cmdk-group">
                  <Command.Item onSelect={handlePreviousThread} className="cmdk-item">
                    <ArrowUp className="cmdk-icon" strokeWidth={1.75} />
                    <span>Previous thread</span>
                    <kbd className="cmdk-shortcut">
                      <span>&#8679;</span>
                      <span>&#8984;</span>[
                    </kbd>
                  </Command.Item>
                  <Command.Item onSelect={handleNextThread} className="cmdk-item">
                    <ArrowDown className="cmdk-icon" strokeWidth={1.75} />
                    <span>Next thread</span>
                    <kbd className="cmdk-shortcut">
                      <span>&#8679;</span>
                      <span>&#8984;</span>]
                    </kbd>
                  </Command.Item>
                  <Command.Item onSelect={handleFind} className="cmdk-item">
                    <Search className="cmdk-icon" strokeWidth={1.75} />
                    <span>Find</span>
                    <kbd className="cmdk-shortcut">
                      <span>&#8984;</span>F
                    </kbd>
                  </Command.Item>
                  <Command.Item onSelect={handleBack} className="cmdk-item">
                    <ArrowLeft className="cmdk-icon" strokeWidth={1.75} />
                    <span>Back</span>
                    <kbd className="cmdk-shortcut">
                      <span>&#8984;</span>[
                    </kbd>
                  </Command.Item>
                </Command.Group>

                {nonArchivedThreads.length > 0 && (
                  <Command.Group heading="Switch thread" className="cmdk-group">
                    {nonArchivedThreads.slice(0, 8).map((thread) => (
                      <Command.Item
                        key={thread.id}
                        value={`thread ${thread.title} ${thread.project} ${thread.id}`}
                        onSelect={() => handleSwitchThread(thread.id)}
                        className="cmdk-item"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            thread.id === activeThreadId ? 'bg-accent' : 'bg-muted-foreground/30'
                          }`}
                        />
                        <span className="truncate">{thread.title}</span>
                        <span className="cmdk-thread-project">{thread.project}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </>
            )}

            {page === 'theme' && (
              <>
                <Command.Group heading="Color theme" className="cmdk-group">
                  {themes.map((theme) => (
                    <Command.Item
                      key={theme.id}
                      value={`theme ${theme.name} ${theme.id}`}
                      onPointerEnter={() =>
                        previewTheme({ themeId: theme.id, ...getThemeFontOverrides(theme) })
                      }
                      onSelect={() => {
                        settingsSnapshotRef.current = null
                        setPage('root')
                        setSearch('')
                        setOpen(false)
                        updateSettings({
                          themeId: theme.id,
                          ...getThemeFontOverrides(theme)
                        })
                      }}
                      className="cmdk-item"
                    >
                      <Palette className="cmdk-icon" strokeWidth={1.75} />
                      <span>{theme.name}</span>
                      {settings.themeId === theme.id && (
                        <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2.5} />
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
                <Command.Group heading="Appearance" className="cmdk-group">
                  {([
                    { mode: 'light' as ThemePreference, label: 'Light mode', Icon: Sun },
                    { mode: 'dark' as ThemePreference, label: 'Dark mode', Icon: Moon },
                    { mode: 'system' as ThemePreference, label: 'System mode', Icon: Monitor }
                  ]).map(({ mode, label, Icon }) => (
                    <Command.Item
                      key={mode}
                      value={`appearance ${label}`}
                      onPointerEnter={() => previewTheme({ themeMode: mode })}
                      onSelect={() => {
                        settingsSnapshotRef.current = null
                        setPage('root')
                        setSearch('')
                        setOpen(false)
                        updateSettings({ themeMode: mode })
                      }}
                      className="cmdk-item"
                    >
                      <Icon className="cmdk-icon" strokeWidth={1.75} />
                      <span>{label}</span>
                      {settings.themeMode === mode && (
                        <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2.5} />
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              </>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
