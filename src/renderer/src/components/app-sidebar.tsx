import { useMemo, useState, useEffect, useRef, type ReactElement, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pin, Trash2, Folder, ChevronDown, SquarePen, LayoutGrid } from 'lucide-react'
import { toast } from 'sonner'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ANIMATION_EASE } from '@/lib/animations'
import { useCodexStore, timeAgo, type Thread } from '@/lib/store'
import { useResizableSidebar } from '@/lib/use-resizable-sidebar'
import { getThreadPreview } from '@/lib/thread-preview'

const MAX_VISIBLE_THREADS = 10
const CHAT_SIDEBAR_MIN_WIDTH = 220

function getThreadIdFromThreadStartResult(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null
  const maybeThread = (result as { thread?: unknown }).thread
  if (typeof maybeThread !== 'object' || maybeThread === null) return null
  const maybeId = (maybeThread as { id?: unknown }).id
  return typeof maybeId === 'string' && maybeId ? maybeId : null
}

function ProjectRowIcon({
  iconDataUrl,
  isCollapsed
}: {
  iconDataUrl?: string | null
  isCollapsed?: boolean
}): ReactElement {
  return (
    <div className="relative w-3.5 h-3.5 shrink-0">
      <AnimatePresence initial={false} mode="wait">
        {isCollapsed ? (
          <motion.div
            key="chevron"
            initial={{ opacity: 0, rotate: 90 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 90 }}
            transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute inset-0"
          >
            <ChevronDown className="w-3.5 h-3.5 text-sidebar-muted" strokeWidth={1.75} />
          </motion.div>
        ) : (
          <motion.div
            key="icon"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute inset-0"
          >
            {iconDataUrl ? (
              <span className="flex h-3.5 w-3.5 items-center justify-center overflow-hidden rounded-[4px] bg-sidebar-accent/70 ring-1 ring-sidebar-border/60">
                <img src={iconDataUrl} alt="" className="h-full w-full object-cover" />
              </span>
            ) : (
              <Folder className="w-3.5 h-3.5 text-sidebar-muted" strokeWidth={1.75} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SortablePinnedThreadRow({
  id,
  children
}: {
  id: string
  children: ReactNode
}): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab'
  }

  return (
    <div ref={setNodeRef} style={style} className="no-drag" {...attributes} {...listeners}>
      {children}
    </div>
  )
}

export default function AppSidebar(): ReactElement {
  const {
    threads,
    activeThreadId,
    activeProject,
    recentProjects,
    isSidebarOpen,
    settings,
    setActiveThread,
    setActiveTab,
    setActiveProject,
    deleteThread,
    createThread,
    updateThreadTitle,
    toggleThreadPinned,
    reorderPinnedThreads,
    setThreadArchived,
    markThreadUnread,
    cloneThread,
    updateSettings
  } = useCodexStore()

  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  useEffect(() => {
    const onResize = (): void => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const sidebarMaxWidth = Math.max(CHAT_SIDEBAR_MIN_WIDTH, Math.floor(windowWidth / 2))

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [showAllGroups, setShowAllGroups] = useState<Record<string, boolean>>({})
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [projectIcons, setProjectIcons] = useState<Record<string, string | null>>({})
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hoveredThread, setHoveredThread] = useState<{
    threadId: string
    preview: string
    x: number
    y: number
  } | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    threadId: string
    x: number
    y: number
  } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const contextThread = useMemo(
    () => (contextMenu ? threads.find((t) => t.id === contextMenu.threadId) || null : null),
    [contextMenu, threads]
  )
  const { containerRef, isResizing, handlePointerDown } = useResizableSidebar({
    width: settings.chatSidebarWidth,
    minWidth: CHAT_SIDEBAR_MIN_WIDTH,
    maxWidth: sidebarMaxWidth,
    onWidthChange: (chatSidebarWidth) => updateSettings({ chatSidebarWidth })
  })

  // Clean up confirm timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    }
  }, [])

  // Close project menu on outside click
  useEffect(() => {
    if (!projectMenuOpen) return
    const handleClick = (e: MouseEvent): void => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setProjectMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [projectMenuOpen])

  // Close context menu on outside click or escape
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = (e: MouseEvent): void => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [contextMenu])

  const handleNewThread = async (project?: string, projectPath?: string): Promise<void> => {
    let id: string = crypto.randomUUID()
    try {
      const result = await window.codex.threadStart({
        cwd: projectPath || activeProject?.path
      })
      id = getThreadIdFromThreadStartResult(result) || id
    } catch (error) {
      console.error('Failed to start thread:', error)
    }
    createThread(id, undefined, project, projectPath || activeProject?.path)
    setActiveTab('threads')
  }

  const toggleCollapsed = (project: string): void => {
    setCollapsedGroups((prev) => {
      const willCollapse = !prev[project]
      if (willCollapse) {
        setShowAllGroups((s) => ({ ...s, [project]: false }))
      }
      return { ...prev, [project]: willCollapse }
    })
  }

  const toggleShowAll = (project: string): void => {
    setShowAllGroups((prev) => ({ ...prev, [project]: !prev[project] }))
  }

  const handleContextMenu = (e: React.MouseEvent, threadId: string): void => {
    e.preventDefault()
    setContextMenu({ threadId, x: e.clientX, y: e.clientY })
  }

  const handleTogglePin = (): void => {
    if (!contextThread) return
    const wasPinned = contextThread.pinned
    toggleThreadPinned(contextThread.id)
    toast(wasPinned ? 'Thread unpinned' : 'Thread pinned')
    setContextMenu(null)
  }

  const handleRenameThread = (): void => {
    if (!contextThread) return
    const title = window.prompt('Rename thread', contextThread.title)?.trim()
    if (title) {
      updateThreadTitle(contextThread.id, title)
    }
    setContextMenu(null)
  }

  const handleToggleArchive = (): void => {
    if (!contextThread) return
    const wasArchived = contextThread.archived
    setThreadArchived(contextThread.id, !wasArchived)
    toast(wasArchived ? 'Thread unarchived' : 'Thread archived')
    setContextMenu(null)
  }

  const handleToggleUnread = (): void => {
    if (!contextThread) return
    markThreadUnread(contextThread.id, !contextThread.unread)
    setContextMenu(null)
  }

  const handleForkToLocal = (): void => {
    if (!contextThread) return
    cloneThread(contextThread.id, 'local')
    setActiveTab('threads')
    setContextMenu(null)
  }

  const handleForkToWorktree = (): void => {
    if (!contextThread) return
    const suggestedName =
      contextThread.project && contextThread.project !== 'local'
        ? `${contextThread.project}-worktree`
        : 'worktree'
    const nextProject = window.prompt('New worktree/project name', suggestedName)?.trim()
    if (nextProject) {
      cloneThread(contextThread.id, nextProject, contextThread.projectPath)
      setActiveTab('threads')
    }
    setContextMenu(null)
  }

  const { pinnedThreads, groupedThreads, archivedGroups } = useMemo(() => {
    const byProject: Record<string, Thread[]> = {}
    const byProjectArchived: Record<string, Thread[]> = {}
    const pinned: Thread[] = []

    for (const thread of threads) {
      if (thread.archived) {
        const projectKey = thread.project || 'local'
        if (!byProjectArchived[projectKey]) byProjectArchived[projectKey] = []
        byProjectArchived[projectKey].push(thread)
        continue
      }

      if (thread.pinned) {
        pinned.push(thread)
        continue
      }

      const projectKey = thread.project || 'local'
      if (!byProject[projectKey]) byProject[projectKey] = []
      byProject[projectKey].push(thread)
    }

    const byNewest = (a: Thread, b: Thread): number => b.createdAt - a.createdAt
    pinned.sort((a, b) => (a.pinnedOrder ?? a.createdAt) - (b.pinnedOrder ?? b.createdAt))
    Object.values(byProject).forEach((list) => list.sort(byNewest))
    Object.values(byProjectArchived).forEach((list) => list.sort(byNewest))

    return {
      pinnedThreads: pinned,
      groupedThreads: Object.entries(byProject),
      archivedGroups: Object.entries(byProjectArchived)
    }
  }, [threads])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = pinnedThreads.findIndex((t) => t.id === active.id)
    const newIndex = pinnedThreads.findIndex((t) => t.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = [...pinnedThreads]
    const [removed] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, removed)
    reorderPinnedThreads(reordered.map((t) => t.id))
  }

  const projectMetaByName = useMemo(() => {
    const next: Record<string, { path?: string }> = {}

    const registerProject = (name?: string, path?: string): void => {
      if (!name || name === 'local' || !path || next[name]?.path) return
      next[name] = { path }
    }

    registerProject(activeProject?.name, activeProject?.path)
    recentProjects.forEach((project) => registerProject(project.name, project.path))
    threads.forEach((thread) => registerProject(thread.project, thread.projectPath))

    return next
  }, [activeProject, recentProjects, threads])

  const projectPathsToLoad = useMemo(
    () => [
      ...new Set(
        Object.values(projectMetaByName).flatMap((project) => (project.path ? [project.path] : []))
      )
    ],
    [projectMetaByName]
  )

  useEffect(() => {
    const missingPaths = projectPathsToLoad.filter((path) => projectIcons[path] === undefined)
    if (missingPaths.length === 0) return

    let cancelled = false

    void Promise.all(
      missingPaths.map(async (path) => [path, await window.codex.getProjectIcon(path)] as const)
    )
      .then((entries) => {
        if (cancelled) return

        setProjectIcons((prev) => {
          const next = { ...prev }
          let changed = false

          for (const [path, iconDataUrl] of entries) {
            if (next[path] !== undefined) continue
            next[path] = iconDataUrl
            changed = true
          }

          return changed ? next : prev
        })
      })
      .catch((error) => {
        console.error('Failed to load project icons:', error)
      })

    return () => {
      cancelled = true
    }
  }, [projectIcons, projectPathsToLoad])

  const getProjectPath = (projectName: string): string | undefined =>
    projectMetaByName[projectName]?.path

  const getProjectIcon = (projectName: string): string | null => {
    const projectPath = getProjectPath(projectName)
    return projectPath ? (projectIcons[projectPath] ?? null) : null
  }

  const renderThreadRow = (thread: Thread): ReactElement => {
    const isActive = thread.id === activeThreadId
    const isThreadStreaming = thread.messages.some((message) => message.isStreaming)

    return (
      <div
        key={thread.id}
        onClick={() => {
          setActiveThread(thread.id)
          if (thread.projectPath) {
            setActiveProject({ name: thread.project, path: thread.projectPath })
          } else {
            const matchingProject = recentProjects.find(
              (project) => project.name === thread.project
            )
            if (matchingProject) {
              setActiveProject(matchingProject)
            } else if (thread.project === 'local') {
              setActiveProject(null)
            }
          }
          setActiveTab('threads')
        }}
        onContextMenu={(e) => handleContextMenu(e, thread.id)}
        className={`group no-drag relative flex items-center justify-between gap-1 ml-5 pl-4 pr-2 py-[5px] mb-0.5 rounded-md cursor-pointer transition-colors text-ui-13 ${
          isActive
            ? 'bg-sidebar-active text-sidebar-foreground'
            : 'text-sidebar-foreground hover:bg-sidebar-hover'
        }`}
        onMouseEnter={(e) => {
          const preview = getThreadPreview(thread)
          if (preview) {
            const rect = e.currentTarget.getBoundingClientRect()
            setHoveredThread({
              threadId: thread.id,
              preview,
              x: rect.right + 8,
              y: rect.top + rect.height / 2
            })
          }
        }}
        onMouseLeave={() => {
          setHoveredThread((prev) => (prev?.threadId === thread.id ? null : prev))
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {!isThreadStreaming && thread.unread && (
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
          )}
          {thread.pinned && (
            <Pin className="w-3 h-3 text-sidebar-muted shrink-0" strokeWidth={1.8} />
          )}
          <span
            className={`truncate flex-1 min-w-0 select-none ${thread.unread && !isActive ? 'font-medium' : ''} ${
              isThreadStreaming ? 'thread-title-shimmer' : ''
            }`}
          >
            {thread.title}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          {thread.additions != null && thread.deletions != null && (
            <span className="text-ui-11 font-mono">
              <span className="text-green-600">+{thread.additions}</span>{' '}
              <span className="text-red-500">-{thread.deletions}</span>
            </span>
          )}
          <span className="text-ui-11 text-sidebar-muted tabular-nums">
            {timeAgo(thread.createdAt)}
          </span>
          {confirmingDeleteId === thread.id ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
                setConfirmingDeleteId(null)
                deleteThread(thread.id)
              }}
              className="px-1.5 py-0.5 text-ui-10 font-medium text-red-500 hover:bg-red-500/10 rounded"
            >
              confirm
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setConfirmingDeleteId(thread.id)
                if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
                confirmTimerRef.current = setTimeout(() => setConfirmingDeleteId(null), 3000)
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-sidebar-active rounded"
            >
              <Trash2 className="w-3 h-3 text-sidebar-muted" strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            ref={containerRef}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: settings.chatSidebarWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={isResizing ? { duration: 0 } : { duration: 0.2, ease: ANIMATION_EASE }}
            className="sidebar-resize-shell h-full"
          >
            <aside className="sidebar-glass flex h-full min-h-0 w-full flex-col overflow-hidden border-r border-border select-none">
              {/* Top nav items */}
              <div className="pt-11 px-3 pb-1 drag-region space-y-0.5">
                <button
                  onClick={() => void handleNewThread()}
                  className="no-drag flex items-center gap-2.5 px-2.5 py-1.5 text-ui-13 text-sidebar-foreground hover:bg-sidebar-hover rounded-md transition-colors w-full"
                >
                  <SquarePen className="w-4 h-4 text-sidebar-muted" strokeWidth={1.75} />
                  New thread
                </button>
                <button
                  onClick={() => setActiveTab('skills')}
                  className="no-drag flex items-center gap-2.5 px-2.5 py-1.5 text-ui-13 text-sidebar-foreground hover:bg-sidebar-hover rounded-md transition-colors w-full"
                >
                  <LayoutGrid className="w-4 h-4 text-sidebar-muted" strokeWidth={1.75} />
                  Skills
                </button>
              </div>

              {/* Threads section header */}
              <div className="flex items-center justify-between px-5 pt-3 pb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-ui-12 font-medium text-sidebar-muted">Threads</span>
                  {activeProject && (
                    <span className="text-ui-11 text-sidebar-muted/70 truncate">
                      {activeProject.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Thread list grouped by project */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide px-2 pb-2">
                {pinnedThreads.length > 0 && (
                  <div className="mb-1.5">
                    <div className="flex items-center gap-2 px-2.5 pt-1 pb-1 mb-1">
                      <Pin className="w-3 h-3 text-sidebar-muted shrink-0" strokeWidth={1.75} />
                      <span className="text-ui-13 font-medium text-sidebar-foreground">Pinned</span>
                      <span className="text-ui-11 text-sidebar-muted ml-auto">
                        {pinnedThreads.length}
                      </span>
                    </div>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={pinnedThreads.map((t) => t.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {pinnedThreads.map((t) => (
                          <SortablePinnedThreadRow key={t.id} id={t.id}>
                            {renderThreadRow(t)}
                          </SortablePinnedThreadRow>
                        ))}
                      </SortableContext>
                    </DndContext>
                  </div>
                )}

                {groupedThreads.map(([project, projectThreads]) => {
                  const key = `project:${project}`
                  const isCollapsed = collapsedGroups[key]
                  const isShowingAll = showAllGroups[key]
                  const hasMore = projectThreads.length > MAX_VISIBLE_THREADS
                  const projectIcon = getProjectIcon(project)
                  const visibleThreads =
                    hasMore && !isShowingAll
                      ? projectThreads.slice(0, MAX_VISIBLE_THREADS)
                      : projectThreads

                  return (
                    <div key={project} className="mb-1.5">
                      <div
                        className="group/project no-drag flex items-center gap-2 px-2.5 pt-1 pb-1 mb-1 w-full hover:bg-sidebar-hover rounded-md transition-colors cursor-pointer"
                        onClick={() => toggleCollapsed(key)}
                      >
                        <div className="shrink-0">
                          <ProjectRowIcon iconDataUrl={projectIcon} isCollapsed={isCollapsed} />
                        </div>
                        <span className="text-ui-13 font-medium text-sidebar-foreground truncate select-none">
                          {project}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const projectPath = getProjectPath(project)
                            void handleNewThread(project, projectPath)
                          }}
                          className="opacity-0 group-hover/project:opacity-100 ml-auto p-0.5 hover:bg-sidebar-active rounded transition-all"
                          title={`New thread in ${project}`}
                        >
                          <SquarePen
                            className="w-3.5 h-3.5 text-sidebar-muted"
                            strokeWidth={1.75}
                          />
                        </button>
                      </div>

                      <AnimatePresence initial={false}>
                        {!isCollapsed && (
                          <motion.div
                            key={`threads:${key}`}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: ANIMATION_EASE }}
                            className="overflow-hidden"
                          >
                            {visibleThreads.map(renderThreadRow)}
                            {hasMore && !isShowingAll && (
                              <button
                                onClick={() => toggleShowAll(key)}
                                className="no-drag ml-5 pl-4 pr-2 py-1 text-ui-12 text-sidebar-muted/50 hover:text-sidebar-foreground transition-colors"
                              >
                                Show {projectThreads.length - MAX_VISIBLE_THREADS} more
                              </button>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}

                {archivedGroups.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-sidebar-border">
                    <div className="px-2.5 pb-1 text-ui-12 font-medium text-sidebar-muted">
                      Archived
                    </div>
                    {archivedGroups.map(([project, projectThreads]) => {
                      const key = `archived:${project}`
                      const isCollapsed = collapsedGroups[key]
                      const isShowingAll = showAllGroups[key]
                      const hasMore = projectThreads.length > MAX_VISIBLE_THREADS
                      const projectIcon = getProjectIcon(project)
                      const visibleThreads =
                        hasMore && !isShowingAll
                          ? projectThreads.slice(0, MAX_VISIBLE_THREADS)
                          : projectThreads

                      return (
                        <div key={key} className="mb-1.5">
                          <button
                            onClick={() => toggleCollapsed(key)}
                            className="no-drag flex items-center gap-2 px-2.5 pt-1 pb-1 mb-1 w-full hover:bg-sidebar-hover rounded-md transition-colors"
                          >
                            <div className="shrink-0">
                              <ProjectRowIcon iconDataUrl={projectIcon} isCollapsed={isCollapsed} />
                            </div>
                            <span className="text-ui-13 font-medium text-sidebar-foreground">
                              {project}
                            </span>
                            <span className="text-ui-11 text-sidebar-muted ml-auto">
                              {projectThreads.length}
                            </span>
                          </button>

                          <AnimatePresence initial={false}>
                            {!isCollapsed && (
                              <motion.div
                                key={`threads:${key}`}
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: ANIMATION_EASE }}
                                className="overflow-hidden"
                              >
                                {visibleThreads.map(renderThreadRow)}
                                {hasMore && !isShowingAll && (
                                  <button
                                    onClick={() => toggleShowAll(key)}
                                    className="no-drag ml-5 pl-4 pr-2 py-1 text-ui-12 text-sidebar-muted/50 hover:text-sidebar-foreground transition-colors"
                                  >
                                    Show {projectThreads.length - MAX_VISIBLE_THREADS} more
                                  </button>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Settings at bottom */}
              <div className="px-3 py-2">
                <button
                  onClick={() => setActiveTab('settings')}
                  className="no-drag flex items-center gap-2.5 px-2.5 py-1.5 text-ui-13 text-sidebar-foreground hover:bg-sidebar-hover rounded-md transition-colors w-full"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-[18px] h-[18px] text-sidebar-muted"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                  </svg>
                  Settings
                </button>
              </div>
            </aside>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize chat sidebar"
              data-active={isResizing}
              onPointerDown={handlePointerDown}
              className="sidebar-resize-handle no-drag"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Thread context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[100] min-w-[200px] bg-popover border border-border rounded-lg shadow-xl py-1 text-ui-13"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={handleTogglePin}
            className="flex w-full px-3 py-1.5 text-popover-foreground hover:bg-secondary transition-colors text-left"
          >
            {contextThread?.pinned ? 'Unpin thread' : 'Pin thread'}
          </button>
          <button
            onClick={handleRenameThread}
            className="flex w-full px-3 py-1.5 text-popover-foreground hover:bg-secondary transition-colors text-left"
          >
            Rename thread
          </button>
          <button
            onClick={handleToggleArchive}
            className="flex w-full px-3 py-1.5 text-popover-foreground hover:bg-secondary transition-colors text-left"
          >
            {contextThread?.archived ? 'Unarchive thread' : 'Archive thread'}
          </button>
          <button
            onClick={handleToggleUnread}
            className="flex w-full px-3 py-1.5 text-popover-foreground hover:bg-secondary transition-colors text-left"
          >
            {contextThread?.unread ? 'Mark as read' : 'Mark as unread'}
          </button>

          <div className="h-px bg-border my-1" />

          <button
            onClick={() => {
              if (contextThread) {
                navigator.clipboard.writeText(contextThread.project || '')
                toast.success('Copied to clipboard')
              }
              setContextMenu(null)
            }}
            className="flex w-full px-3 py-1.5 text-popover-foreground hover:bg-secondary transition-colors text-left"
          >
            Copy working directory
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.threadId)
              toast.success('Copied to clipboard')
              setContextMenu(null)
            }}
            className="flex w-full px-3 py-1.5 text-popover-foreground hover:bg-secondary transition-colors text-left"
          >
            Copy session ID
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`codex://thread/${contextMenu.threadId}`)
              toast.success('Copied to clipboard')
              setContextMenu(null)
            }}
            className="flex w-full px-3 py-1.5 text-popover-foreground hover:bg-secondary transition-colors text-left"
          >
            Copy deeplink
          </button>

          <div className="h-px bg-border my-1" />

          <button
            onClick={handleForkToLocal}
            className="flex w-full px-3 py-1.5 text-popover-foreground hover:bg-secondary transition-colors text-left"
          >
            Fork into local
          </button>
          <button
            onClick={handleForkToWorktree}
            className="flex w-full px-3 py-1.5 text-popover-foreground hover:bg-secondary transition-colors text-left"
          >
            Fork into new worktree
          </button>
        </div>
      )}

      {/* Thread preview tooltip */}
      <AnimatePresence>
        {hoveredThread && !contextMenu && (
          <motion.div
            key={hoveredThread.threadId}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.15 }}
            className="fixed z-[90] max-w-[280px] px-3 py-2 rounded-lg border border-border bg-popover shadow-lg pointer-events-none"
            style={{
              left: hoveredThread.x,
              top: hoveredThread.y,
              transform: 'translateY(-50%)'
            }}
          >
            <p className="text-ui-12 text-popover-foreground leading-relaxed break-words whitespace-pre-wrap">
              {hoveredThread.preview}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
