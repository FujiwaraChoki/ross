import { useEffect, useState, useCallback, type ReactElement } from 'react'
import { Command } from 'cmdk'
import {
  SquarePen,
  FolderOpen,
  Settings,
  ArrowUp,
  ArrowDown,
  Search,
  ArrowLeft,
  Keyboard
} from 'lucide-react'
import { useCodexStore } from '@/lib/store'

export default function CommandBar(): ReactElement {
  const [open, setOpen] = useState(false)

  const {
    threads,
    activeThreadId,
    activeProject,
    setActiveThread,
    setActiveTab,
    setActiveProject,
    createThread,
    recentProjects
  } = useCodexStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const close = useCallback(() => setOpen(false), [])

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

  if (!open) return <></>

  const nonArchivedThreads = threads.filter((t) => !t.archived)

  return (
    <div className="cmdk-overlay" onClick={close}>
      <div className="cmdk-wrapper" onClick={(e) => e.stopPropagation()}>
        <Command className="cmdk-root" loop>
          <div className="cmdk-input-wrapper">
            <Command.Input placeholder="Search commands..." className="cmdk-input" autoFocus />
          </div>
          <Command.List className="cmdk-list">
            <Command.Empty className="cmdk-empty">No results found.</Command.Empty>

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
                    value={`thread ${thread.title} ${thread.project}`}
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
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
