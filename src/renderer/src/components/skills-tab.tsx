import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { Search, RefreshCw, Plus, Folder } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { ANIMATION_EASE, staggerItem } from '@/lib/animations'
import { Switch } from '@/components/ui/switch'
import { useCodexStore } from '@/lib/store'

interface SkillDependencyTool {
  type: string
  value: string
  description?: string
  transport?: string
  url?: string
}

interface SkillInfo {
  name: string
  description: string
  path: string
  enabled: boolean
  interface?: {
    displayName?: string
    shortDescription?: string
  }
  dependencies?: {
    tools?: SkillDependencyTool[]
  }
}

interface SkillCwdEntry {
  cwd: string
  skills: SkillInfo[]
  errors?: unknown[]
}

interface SkillsListResult {
  data?: SkillCwdEntry[]
}

interface SkillsConfigWriteResult {
  effectiveEnabled?: boolean
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Failed to load skills from Codex'
}

/** Deterministic gradient colors from skill name */
const GRADIENTS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-500',
  'from-pink-500 to-rose-500',
  'from-amber-400 to-orange-500',
  'from-emerald-400 to-teal-500',
  'from-indigo-500 to-blue-600',
  'from-fuchsia-500 to-pink-500',
  'from-cyan-400 to-blue-500',
  'from-rose-400 to-red-500',
  'from-teal-400 to-emerald-500',
  'from-orange-400 to-amber-500',
  'from-purple-500 to-indigo-500'
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function SkillIcon({ name }: { name: string }): ReactElement {
  const gradient = GRADIENTS[hashString(name) % GRADIENTS.length]
  const initials = name
    .split(/[\s_-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')

  return (
    <div
      className={`size-9 shrink-0 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center`}
    >
      <span className="text-ui-11 font-semibold text-white leading-none">{initials}</span>
    </div>
  )
}

function getSource(cwd: string): string {
  const parts = cwd.split('/')
  return parts[parts.length - 1] || cwd
}

export default function SkillsTab(): ReactElement {
  const activeProject = useCodexStore((state) => state.activeProject)
  const [entries, setEntries] = useState<SkillCwdEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isReloading, setIsReloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pendingPaths, setPendingPaths] = useState<string[]>([])

  const loadSkills = useCallback(
    async (forceReload = false): Promise<void> => {
      if (forceReload) setIsReloading(true)
      else setIsLoading(true)

      try {
        const result = (await window.codex.skillsList({
          forceReload,
          cwds: activeProject?.path ? [activeProject.path] : undefined
        })) as SkillsListResult
        setEntries(Array.isArray(result?.data) ? result.data : [])
        setError(null)
      } catch (err) {
        setError(toErrorMessage(err))
      } finally {
        setIsLoading(false)
        setIsReloading(false)
      }
    },
    [activeProject?.path]
  )

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  const allSkills = useMemo(() => {
    const skills: Array<SkillInfo & { source: string }> = []
    for (const entry of entries) {
      const source = getSource(entry.cwd)
      for (const skill of entry.skills) {
        skills.push({ ...skill, source })
      }
    }
    skills.sort((a, b) => {
      const nameA = (a.interface?.displayName || a.name).toLowerCase()
      const nameB = (b.interface?.displayName || b.name).toLowerCase()
      return nameA.localeCompare(nameB)
    })
    return skills
  }, [entries])

  const filtered = useMemo(() => {
    if (!search.trim()) return allSkills
    const q = search.toLowerCase()
    return allSkills.filter((s) => {
      const name = (s.interface?.displayName || s.name).toLowerCase()
      const desc = (s.interface?.shortDescription || s.description).toLowerCase()
      return name.includes(q) || desc.includes(q)
    })
  }, [allSkills, search])

  const handleToggleSkill = useCallback(async (path: string, enabled: boolean): Promise<void> => {
    setPendingPaths((current) => (current.includes(path) ? current : [...current, path]))
    setError(null)

    try {
      const result = (await window.codex.skillsConfigWrite({
        path,
        enabled
      })) as SkillsConfigWriteResult
      const nextEnabled = result.effectiveEnabled ?? enabled

      setEntries((current) =>
        current.map((entry) => ({
          ...entry,
          skills: entry.skills.map((skill) =>
            skill.path === path ? { ...skill, enabled: nextEnabled } : skill
          )
        }))
      )
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setPendingPaths((current) => current.filter((currentPath) => currentPath !== path))
    }
  }, [])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: ANIMATION_EASE }}
        className="max-w-5xl mx-auto px-8 py-8"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h1 className="text-ui-2xl font-semibold tracking-tight">Skills</h1>
            <p className="text-ui-13 text-muted-foreground mt-1">
              Give Codex superpowers.{' '}
              <span className="text-blue-500 hover:underline cursor-pointer">Learn more</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadSkills(true)}
              disabled={isLoading || isReloading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-ui-13 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${isReloading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search skills"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-44 rounded-md border border-border bg-background pl-8 pr-3 text-ui-13 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <button className="flex items-center gap-1.5 px-3 py-1.5 text-ui-13 bg-foreground text-background rounded-md hover:opacity-90 transition-opacity font-medium">
              <Plus className="size-3.5" />
              New skill
            </button>
          </div>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: ANIMATION_EASE }}
              className="overflow-hidden"
            >
              <div className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-ui-13 text-red-600 mt-4">
                {error}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        <AnimatePresence mode="wait">
          {isLoading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: ANIMATION_EASE }}
              className="mt-12 text-center text-ui-13 text-muted-foreground"
            >
              Loading skills...
            </motion.div>
          )}

          {/* Empty */}
          {!isLoading && allSkills.length === 0 && !error && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: ANIMATION_EASE }}
              className="mt-12 text-center text-ui-13 text-muted-foreground"
            >
              No skills found for the current workspace.
            </motion.div>
          )}

          {/* Skills grid */}
          {!isLoading && filtered.length > 0 && (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: ANIMATION_EASE }}
              className="mt-6"
            >
              <p className="text-ui-13 font-medium text-muted-foreground mb-4">Installed</p>

              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {filtered.map((skill, index) => {
                  const displayName = skill.interface?.displayName || skill.name
                  const description = skill.interface?.shortDescription || skill.description

                  return (
                    <motion.div
                      key={`${skill.source}-${skill.name}`}
                      {...staggerItem(index)}
                      className="flex items-start gap-3 min-w-0"
                    >
                      <SkillIcon name={skill.name} />
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-ui-13 font-semibold truncate">{displayName}</span>
                          <span className="flex items-center gap-1 text-ui-11 text-muted-foreground shrink-0">
                            <Folder className="size-3" />
                            {skill.source}
                          </span>
                        </div>
                        <p className="text-ui-12 text-muted-foreground mt-0.5 truncate">
                          {description}
                        </p>
                      </div>
                      <Switch
                        checked={skill.enabled}
                        disabled={pendingPaths.includes(skill.path)}
                        onCheckedChange={(next) => void handleToggleSkill(skill.path, next)}
                        className="shrink-0 mt-1"
                      />
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          )}

          {/* Search with no results */}
          {!isLoading && filtered.length === 0 && allSkills.length > 0 && (
            <motion.div
              key="no-results"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: ANIMATION_EASE }}
              className="mt-12 text-center text-ui-13 text-muted-foreground"
            >
              No skills match &ldquo;{search}&rdquo;
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
