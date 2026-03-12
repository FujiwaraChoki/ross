import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ANIMATION_EASE } from '@/lib/animations'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Globe,
  ExternalLink,
  Loader2,
  Monitor,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server,
  TerminalSquare,
  Trash2,
  SlidersHorizontal,
  Smile,
  Sun
} from 'lucide-react'
import { useCodexStore } from '@/lib/store'
import {
  BUNDLED_SANS_FONTS,
  BUNDLED_CODE_FONTS,
  UI_SANS_FONT_SIZE_MIN,
  UI_SANS_FONT_SIZE_MAX,
  UI_CODE_FONT_SIZE_MIN,
  UI_CODE_FONT_SIZE_MAX,
  clampSansFontSize,
  clampCodeFontSize
} from '@/lib/ui-preferences'
import { useSystemFonts } from '@/lib/system-fonts'
import { useResizableSidebar } from '@/lib/use-resizable-sidebar'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import {
  DEFAULT_THEME_ID,
  getThemeFontOverrides,
  type ThemeCatalogEntry,
  type ThemePreference
} from '../../../shared/theme'

type SettingsPage = 'General' | 'Configuration' | 'Personalization' | 'MCP servers'

interface SettingRowProps {
  title: string
  description: string
  control: ReactNode
}

function SettingRow({ title, description, control }: SettingRowProps): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-3 border-t border-border px-3 py-3 first:border-t-0 md:grid-cols-[1fr_auto] md:items-center md:gap-6">
      <div>
        <p className="text-ui-13 font-medium text-foreground">{title}</p>
        <p className="mt-0.5 max-w-[470px] text-ui-12 text-muted-foreground">{description}</p>
      </div>
      <div className="md:self-center">{control}</div>
    </div>
  )
}

interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

interface SegmentedProps<T extends string> {
  value: T
  options: SegmentedOption<T>[]
  onChange: (next: T) => void
}

function Segmented<T extends string>({
  value,
  options,
  onChange
}: SegmentedProps<T>): ReactElement {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-secondary p-0.5">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-ui-13 transition-colors ${active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

interface FontSettingRowProps {
  title: string
  description: string
  sizeValue: number
  sizeMin: number
  sizeMax: number
  onSizeChange: (next: number) => void
  fontValue: string
  onFontChange: (next: string) => void
  kind: 'sans' | 'code'
}

function FontSettingRow({
  title,
  description,
  sizeValue,
  sizeMin,
  sizeMax,
  onSizeChange,
  fontValue,
  onFontChange,
  kind
}: FontSettingRowProps): ReactElement {
  const systemFonts = useSystemFonts()
  const bundled = kind === 'sans' ? BUNDLED_SANS_FONTS : BUNDLED_CODE_FONTS
  const bundledSet = new Set<string>(bundled)

  // System fonts for this kind, excluding anything already in bundled list
  const systemList = systemFonts.filter((f) => {
    if (bundledSet.has(f.name)) return false
    // For code, prefer mono-hinted fonts first but show all
    return true
  })

  const monoFonts = systemList.filter((f) => f.mono)
  const sansFonts = systemList.filter((f) => !f.mono)

  return (
    <SettingRow
      title={title}
      description={description}
      control={
        <div className="flex items-center gap-2">
          <input
            value={sizeValue}
            onChange={(e) => {
              const next = Number(e.target.value)
              if (Number.isFinite(next)) {
                onSizeChange(clampNumber(next, sizeMin, sizeMax))
              }
            }}
            type="number"
            min={sizeMin}
            max={sizeMax}
            className="h-8 w-[78px] rounded-lg border border-border bg-background px-2.5 text-center text-ui-13"
          />
          <span className="text-ui-13 text-muted-foreground">px</span>
          <select
            value={fontValue}
            onChange={(e) => onFontChange(e.target.value)}
            className="h-8 w-[220px] rounded-lg border border-border bg-background px-2.5 text-ui-13"
          >
            <optgroup label="Bundled">
              {bundled.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </optgroup>
            {kind === 'code' && monoFonts.length > 0 && (
              <optgroup label="System — Monospace">
                {monoFonts.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
            )}
            {kind === 'code' && sansFonts.length > 0 && (
              <optgroup label="System — Other">
                {sansFonts.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
            )}
            {kind === 'sans' && systemList.length > 0 && (
              <optgroup label="System">
                {systemList.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      }
    />
  )
}

interface ThemePreviewProps {
  theme: ThemeCatalogEntry
}

function ThemePreview({ theme }: ThemePreviewProps): ReactElement {
  const lightTokens = theme.tokens.light
  const darkTokens = theme.tokens.dark

  return (
    <div className="grid grid-cols-2 gap-2">
      {[lightTokens, darkTokens].map((tokens, index) => (
        <div
          key={`${theme.id}-${index === 0 ? 'light' : 'dark'}`}
          className="rounded-lg border border-border/70 p-2"
          style={{ background: tokens.background }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full border border-black/10"
              style={{ background: tokens.accent }}
            />
            <span
              className="h-2.5 w-2.5 rounded-full border border-black/10"
              style={{ background: tokens.secondary }}
            />
            <span
              className="h-2.5 w-2.5 rounded-full border border-black/10"
              style={{ background: tokens.sidebar }}
            />
          </div>
          <div
            className="mt-2 h-8 rounded-md border border-border/60"
            style={{ background: tokens.card }}
          />
        </div>
      ))}
    </div>
  )
}

interface ThemeCardProps {
  theme: ThemeCatalogEntry
  selected: boolean
  onSelect: (themeId: string) => void
  onDelete?: (themeId: string) => void
  isDeleting: boolean
}

function ThemeCard({
  theme,
  selected,
  onSelect,
  onDelete,
  isDeleting
}: ThemeCardProps): ReactElement {
  return (
    <div
      className={`group relative flex h-full flex-col rounded-xl border p-3 text-left transition-all duration-150 ease-out ${
        selected
          ? 'border-accent/50 bg-accent/6'
          : 'border-border bg-secondary/25 hover:bg-secondary/50'
      }`}
    >
      <button type="button" onClick={() => onSelect(theme.id)} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-ui-13 font-medium text-foreground">{theme.name}</p>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                {theme.source === 'built-in' ? 'Built-in' : 'Imported'}
              </span>
            </div>
            {theme.description ? (
              <p className="mt-1 text-ui-12 text-muted-foreground">{theme.description}</p>
            ) : null}
          </div>
          {selected ? (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </span>
          ) : null}
        </div>

        <div className="mt-3">
          <ThemePreview theme={theme} />
        </div>

        {theme.fonts ? (
          <p className="mt-2 text-ui-12 text-muted-foreground">
            Fonts: {theme.fonts.sans || 'Current sans'} / {theme.fonts.code || 'Current code'}
          </p>
        ) : null}
      </button>

      {onDelete ? (
        <button
          type="button"
          onClick={() => onDelete(theme.id)}
          disabled={isDeleting}
          className="mt-3 inline-flex items-center gap-1 self-start rounded-md px-2 py-1 text-ui-12 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDeleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.9} />
          ) : (
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
          )}
          Delete
        </button>
      ) : null}
    </div>
  )
}

function buildThemeSelectionSettings(theme: ThemeCatalogEntry): {
  themeId: string
  sansFontFamily?: string
  codeFontFamily?: string
} {
  return {
    themeId: theme.id,
    ...getThemeFontOverrides(theme)
  }
}

const NAV_ITEMS: { label: SettingsPage; icon: typeof Code2 }[] = [
  { label: 'General', icon: Code2 },
  { label: 'Configuration', icon: SlidersHorizontal },
  { label: 'Personalization', icon: Smile },
  { label: 'MCP servers', icon: Server }
]

type CodexApprovalPolicy = 'untrusted' | 'on-failure' | 'on-request' | 'never'
type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

interface CodexPermissionSettings {
  approvalPolicy: CodexApprovalPolicy
  sandboxMode: CodexSandboxMode
}

type McpTransport = 'stdio' | 'url'

interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  enabled?: boolean
  [key: string]: unknown
}

interface McpServerDraft {
  originalName: string | null
  name: string
  enabled: boolean
  transport: McpTransport
  command: string
  argsText: string
  envText: string
  url: string
  preserved: Record<string, unknown>
}

interface McpRuntimeStatus {
  name: string
  tools?: Record<string, unknown>
  resources?: unknown[]
  resourceTemplates?: unknown[]
  authStatus?: string
}

interface McpStatusListResult {
  data?: McpRuntimeStatus[]
  nextCursor?: string | null
}

interface ConfigWriteResult {
  version?: string | null
  filePath?: string | null
}

const FILE_EDITOR_OPTIONS = [
  { value: 'cursor', label: 'Cursor' },
  { value: 'zed', label: 'Zed' },
  { value: 'vscode', label: 'VS Code' },
  { value: 'ghostty', label: 'Ghostty' }
] as const

const CODEX_APPROVAL_POLICY_OPTIONS: {
  value: CodexApprovalPolicy
  label: string
}[] = [
  { value: 'untrusted', label: 'Ask for approval' },
  { value: 'on-request', label: 'On request' },
  { value: 'never', label: 'Never ask' },
  { value: 'on-failure', label: 'On failure (legacy)' }
]

const CODEX_SANDBOX_MODE_OPTIONS: {
  value: CodexSandboxMode
  label: string
}[] = [
  { value: 'read-only', label: 'Read only' },
  { value: 'workspace-write', label: 'Workspace write' },
  { value: 'danger-full-access', label: 'Full access' }
]

const DEFAULT_CODEX_PERMISSIONS: CodexPermissionSettings = {
  approvalPolicy: 'on-request',
  sandboxMode: 'workspace-write'
}

const SETTINGS_SIDEBAR_MIN_WIDTH = 220
const SETTINGS_SIDEBAR_MAX_WIDTH = 360

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeMcpServerConfig(value: unknown): McpServerConfig | null {
  if (!isRecord(value)) return null

  const entry: McpServerConfig = { ...value }

  if (typeof entry.command !== 'string') delete entry.command
  if (!Array.isArray(entry.args)) delete entry.args
  else entry.args = entry.args.filter((item): item is string => typeof item === 'string')

  if (!isRecord(entry.env)) delete entry.env
  else {
    entry.env = Object.fromEntries(
      Object.entries(entry.env).map(([key, envValue]) => [key, String(envValue)])
    )
  }

  if (typeof entry.url !== 'string') delete entry.url
  if (typeof entry.enabled !== 'boolean') delete entry.enabled

  return entry
}

function normalizeMcpServers(value: unknown): Record<string, McpServerConfig> {
  if (!isRecord(value)) return {}

  const normalized: Record<string, McpServerConfig> = {}
  for (const [name, entry] of Object.entries(value)) {
    const parsed = normalizeMcpServerConfig(entry)
    if (parsed) normalized[name] = parsed
  }

  return normalized
}

function formatArgs(args?: string[]): string {
  return Array.isArray(args) ? args.join('\n') : ''
}

function formatEnv(env?: Record<string, string>): string {
  if (!env) return ''
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

function createMcpServerDraft(name: string | null, config?: McpServerConfig): McpServerDraft {
  const transport: McpTransport = config?.url ? 'url' : 'stdio'
  const { command, args, env, url, enabled, ...preserved } = config || {}

  return {
    originalName: name,
    name: name || '',
    enabled: enabled !== false,
    transport,
    command: typeof command === 'string' ? command : '',
    argsText: formatArgs(args),
    envText: formatEnv(env),
    url: typeof url === 'string' ? url : '',
    preserved
  }
}

function parseArgsText(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseEnvText(value: string): { env: Record<string, string>; invalidLine: string | null } {
  const env: Record<string, string> = {}

  for (const rawLine of value.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const separator = line.indexOf('=')
    if (separator <= 0) {
      return { env: {}, invalidLine: rawLine }
    }

    const key = line.slice(0, separator).trim()
    const envValue = line.slice(separator + 1)
    env[key] = envValue
  }

  return { env, invalidLine: null }
}

function applyEnabledState(config: McpServerConfig, enabled: boolean): McpServerConfig {
  const next = { ...config }
  if (enabled) delete next.enabled
  else next.enabled = false
  return next
}

function summarizeMcpServer(config: McpServerConfig): string {
  if (typeof config.url === 'string' && config.url) {
    return config.url
  }

  const command = typeof config.command === 'string' ? config.command : 'No command'
  const args =
    Array.isArray(config.args) && config.args.length > 0 ? ` ${config.args.join(' ')}` : ''
  return `${command}${args}`
}

function getConfigWriteTarget(result: Awaited<ReturnType<typeof window.codex.configRead>>): {
  filePath: string | null
  version: string | null
} {
  for (const layer of result?.layers || []) {
    if (layer?.name?.type === 'user' && typeof layer.name.file === 'string') {
      return {
        filePath: layer.name.file,
        version: typeof layer.version === 'string' ? layer.version : null
      }
    }
  }

  return { filePath: null, version: null }
}

function normalizeMcpRuntimeStatuses(value: unknown): Record<string, McpRuntimeStatus> {
  if (!isRecord(value)) return {}
  const data = Array.isArray(value.data) ? value.data : []

  return Object.fromEntries(
    data
      .filter(
        (entry): entry is McpRuntimeStatus => isRecord(entry) && typeof entry.name === 'string'
      )
      .map((entry) => [entry.name, entry])
  )
}

function formatAuthStatus(value: string | undefined): string | null {
  if (!value) return null
  switch (value) {
    case 'oAuth':
      return 'OAuth'
    case 'unsupported':
      return 'No auth'
    default:
      return value
  }
}

function PersonalizationPage(): ReactElement {
  const { settings, updateSettings } = useCodexStore()
  const [customInstructions, setCustomInstructions] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    window.codex.getCustomInstructions().then((text) => {
      setCustomInstructions(text)
      setLoaded(true)
    })
  }, [])

  return (
    <div className="mx-auto w-full max-w-2xl px-10 pb-12 pt-16">
      <h1 className="text-ui-44 font-semibold tracking-tight">Personalization</h1>

      <section className="mt-6 overflow-hidden rounded-xl border border-border bg-secondary/25">
        <div className="grid grid-cols-[1fr_auto] items-center gap-6 px-4 py-4">
          <div>
            <p className="text-ui-13 font-medium text-foreground">Personality</p>
            <p className="mt-0.5 text-ui-12 text-muted-foreground">
              Choose a default tone for Codex responses
            </p>
          </div>
          <select
            value={settings.personality}
            onChange={(e) =>
              updateSettings({
                personality: e.target.value as 'friendly' | 'pragmatic' | 'none'
              })
            }
            className="h-8 min-w-[140px] rounded-lg border border-border bg-background px-2.5 text-ui-13"
          >
            <option value="friendly">Friendly</option>
            <option value="pragmatic">Pragmatic</option>
            <option value="none">None</option>
          </select>
        </div>
      </section>

      <h2 className="mt-7 text-ui-20 font-semibold tracking-tight">Custom instructions</h2>
      <p className="mt-1 text-ui-13 text-muted-foreground">
        Edit instructions that tailor Codex to you.{' '}
        <span className="inline-flex items-baseline gap-0.5">
          Learn more <ExternalLink className="inline h-2.5 w-2.5" />
        </span>
      </p>

      <textarea
        value={customInstructions}
        onChange={(e) => setCustomInstructions(e.target.value)}
        placeholder="Add your custom instructions…"
        disabled={!loaded}
        className="mt-3 h-[200px] w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-ui-13 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-border disabled:opacity-50"
      />

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={isSaving || !loaded}
          onClick={async () => {
            setIsSaving(true)
            try {
              await window.codex.setCustomInstructions(customInstructions)
              updateSettings({ customInstructions })
            } finally {
              setIsSaving(false)
            }
          }}
          className="h-8 rounded-lg bg-foreground px-3.5 text-ui-13 font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function ConfigurationPage(): ReactElement {
  const [permissions, setPermissions] = useState<CodexPermissionSettings>(DEFAULT_CODEX_PERMISSIONS)
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)
  const [permissionsSaving, setPermissionsSaving] = useState(false)
  const [permissionsError, setPermissionsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const normalizeApprovalPolicy = (value: unknown): CodexApprovalPolicy => {
      switch (value) {
        case 'untrusted':
        case 'on-failure':
        case 'on-request':
        case 'never':
          return value
        default:
          return DEFAULT_CODEX_PERMISSIONS.approvalPolicy
      }
    }

    const normalizeSandboxMode = (value: unknown): CodexSandboxMode => {
      switch (value) {
        case 'read-only':
        case 'workspace-write':
        case 'danger-full-access':
          return value
        default:
          return DEFAULT_CODEX_PERMISSIONS.sandboxMode
      }
    }

    void window.codex
      .configRead({ includeLayers: false })
      .then((result) => {
        if (cancelled) return

        setPermissions({
          approvalPolicy: normalizeApprovalPolicy(result?.config?.approval_policy),
          sandboxMode: normalizeSandboxMode(result?.config?.sandbox_mode)
        })
      })
      .catch((error) => {
        console.error('Failed to load Codex permissions config:', error)
        if (!cancelled) {
          setPermissionsError('Failed to load Codex permissions. Showing defaults.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPermissionsLoaded(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const savePermissions = async (next: CodexPermissionSettings): Promise<void> => {
    const previous = permissions
    setPermissions(next)
    setPermissionsSaving(true)
    setPermissionsError(null)

    try {
      await window.codex.configBatchWrite({
        edits: [
          {
            keyPath: 'approval_policy',
            value: next.approvalPolicy,
            mergeStrategy: 'replace'
          },
          {
            keyPath: 'sandbox_mode',
            value: next.sandboxMode,
            mergeStrategy: 'replace'
          }
        ],
        filePath: null,
        expectedVersion: null
      })
    } catch (error) {
      console.error('Failed to save Codex permissions config:', error)
      setPermissions(previous)
      setPermissionsError('Failed to save Codex permissions. Please try again.')
    } finally {
      setPermissionsSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-10 pb-12 pt-16">
      <h1 className="text-ui-44 font-semibold tracking-tight">Configuration</h1>
      <p className="mt-1 text-ui-15 text-muted-foreground">
        These settings apply to anywhere Codex is used
      </p>

      <section className="mt-6 overflow-hidden rounded-xl border border-border bg-secondary/25">
        <div className="grid grid-cols-[1fr_auto] items-center gap-6 px-4 py-4">
          <div>
            <p className="text-ui-13 font-medium text-foreground">config.toml</p>
            <p className="mt-0.5 text-ui-12 text-muted-foreground">
              Edit your config to customize agent behavior
            </p>
            <p className="mt-0.5 text-ui-12 text-muted-foreground">
              Restart Codex after editing to apply changes{' '}
              <span className="inline-flex items-baseline gap-0.5">
                Docs <ExternalLink className="inline h-2.5 w-2.5" />
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void window.codex.openConfigFile()}
            className="h-8 rounded-lg border border-border bg-background px-3 text-ui-13 font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Open config.toml
          </button>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-6 border-t border-border px-4 py-4">
          <div>
            <p className="text-ui-13 font-medium text-foreground">Permissions</p>
            <p className="mt-0.5 text-ui-12 text-muted-foreground">
              Configure how much access Codex has when running commands.
            </p>
          </div>
          <div className="text-right text-ui-12 text-muted-foreground">
            {!permissionsLoaded
              ? 'Loading...'
              : permissionsSaving
                ? 'Saving...'
                : permissionsError || 'Applies to future turns'}
          </div>
        </div>
        <SettingRow
          title="Approval policy"
          description="Choose when Codex should ask before executing commands."
          control={
            <select
              value={permissions.approvalPolicy}
              disabled={!permissionsLoaded || permissionsSaving}
              onChange={(e) =>
                void savePermissions({
                  ...permissions,
                  approvalPolicy: e.target.value as CodexApprovalPolicy
                })
              }
              className="h-8 min-w-[220px] rounded-lg border border-border bg-background px-2.5 text-ui-13 disabled:opacity-50"
            >
              {CODEX_APPROVAL_POLICY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          }
        />
        <SettingRow
          title="Sandbox mode"
          description="Select read-only, workspace write access, or full access."
          control={
            <select
              value={permissions.sandboxMode}
              disabled={!permissionsLoaded || permissionsSaving}
              onChange={(e) =>
                void savePermissions({
                  ...permissions,
                  sandboxMode: e.target.value as CodexSandboxMode
                })
              }
              className="h-8 min-w-[220px] rounded-lg border border-border bg-background px-2.5 text-ui-13 disabled:opacity-50"
            >
              {CODEX_SANDBOX_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          }
        />
        {permissions.sandboxMode === 'danger-full-access' && (
          <div className="border-t border-border px-4 py-3">
            <p className="text-ui-12 text-muted-foreground">
              Full access disables Codex sandboxing and should only be used in trusted environments.
            </p>
          </div>
        )}
        <div className="grid grid-cols-[1fr_auto] items-center gap-6 border-t border-border px-4 py-4">
          <div>
            <p className="text-ui-13 font-medium text-foreground">Open source licenses</p>
            <p className="mt-0.5 text-ui-12 text-muted-foreground">
              Third-party notices for bundled dependencies
            </p>
          </div>
          <button
            type="button"
            onClick={() => void window.codex.openBundledDocument('docs/THIRD_PARTY_NOTICES.md')}
            className="h-8 rounded-lg border border-border bg-background px-3 text-ui-13 font-medium text-foreground transition-colors hover:bg-secondary"
          >
            View
          </button>
        </div>
      </section>
    </div>
  )
}

function McpServersPage(): ReactElement {
  const [servers, setServers] = useState<Record<string, McpServerConfig>>({})
  const [runtimeStatuses, setRuntimeStatuses] = useState<Record<string, McpRuntimeStatus>>({})
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState<McpServerDraft | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [configFilePath, setConfigFilePath] = useState<string | null>(null)
  const [configVersion, setConfigVersion] = useState<string | null>(null)

  const loadRuntimeStatuses = useCallback(async (): Promise<void> => {
    try {
      const result = (await Promise.race([
        window.codex.mcpServerStatusList({}),
        new Promise((_, reject) =>
          window.setTimeout(() => reject(new Error('Timed out loading MCP status')), 2500)
        )
      ])) as McpStatusListResult
      setRuntimeStatuses(normalizeMcpRuntimeStatuses(result))
    } catch (statusError) {
      console.error('Failed to load MCP runtime status:', statusError)
    }
  }, [])

  const readServers = useCallback(async (): Promise<{
    servers: Record<string, McpServerConfig>
    filePath: string | null
    version: string | null
  }> => {
    const result = await window.codex.configRead({ includeLayers: true })
    const target = getConfigWriteTarget(result)
    return {
      servers: normalizeMcpServers(result?.config?.mcp_servers),
      filePath: target.filePath,
      version: target.version
    }
  }, [])

  const loadServers = useCallback(async (): Promise<void> => {
    try {
      const nextConfig = await readServers()
      setServers(nextConfig.servers)
      setConfigFilePath(nextConfig.filePath)
      setConfigVersion(nextConfig.version)
      setError(null)
      void loadRuntimeStatuses()
    } catch (loadError) {
      console.error('Failed to load MCP servers config:', loadError)
      setError('Failed to load MCP servers.')
    } finally {
      setLoaded(true)
    }
  }, [loadRuntimeStatuses, readServers])

  useEffect(() => {
    void loadServers()
  }, [loadServers])

  const persistEdits = useCallback(
    async (
      edits: Array<{ keyPath: string; value: unknown; mergeStrategy: 'replace' | 'upsert' }>,
      nextServers: Record<string, McpServerConfig>,
      successMessage: string
    ): Promise<void> => {
      const previousServers = servers
      const previousVersion = configVersion
      setServers(nextServers)
      setSaving(true)
      setError(null)
      setNotice(null)

      try {
        const result = (await window.codex.configBatchWrite({
          edits,
          filePath: configFilePath,
          expectedVersion: configVersion
        })) as ConfigWriteResult

        setConfigVersion(typeof result?.version === 'string' ? result.version : previousVersion)
        setConfigFilePath(typeof result?.filePath === 'string' ? result.filePath : configFilePath)

        await window.codex.mcpServerReload()
        void loadRuntimeStatuses()
        setNotice(successMessage)
      } catch (saveError) {
        console.error('Failed to save MCP servers config:', saveError)
        setServers(previousServers)
        setConfigVersion(previousVersion)
        setError('Failed to save MCP servers. Your last change was not applied.')
        throw saveError
      } finally {
        setSaving(false)
      }
    },
    [configFilePath, configVersion, loadRuntimeStatuses, servers]
  )

  const reloadRuntime = useCallback(async (): Promise<void> => {
    setReloading(true)
    setError(null)
    setNotice(null)

    try {
      await window.codex.mcpServerReload()
      void loadRuntimeStatuses()
      setNotice('Reloaded MCP servers from config.')
    } catch (reloadError) {
      console.error('Failed to reload MCP servers:', reloadError)
      setError('Failed to reload MCP servers.')
    } finally {
      setReloading(false)
    }
  }, [loadRuntimeStatuses])

  const sortedServers = useMemo(
    () => Object.entries(servers).sort(([left], [right]) => left.localeCompare(right)),
    [servers]
  )

  const handleToggleServer = useCallback(
    async (name: string, enabled: boolean): Promise<void> => {
      const current = servers[name]
      if (!current) return

      const nextServers = {
        ...servers,
        [name]: applyEnabledState(current, enabled)
      }

      await persistEdits(
        [
          {
            keyPath: `mcp_servers.${name}`,
            value: nextServers[name],
            mergeStrategy: 'replace'
          }
        ],
        nextServers,
        enabled ? `Enabled ${name}.` : `Disabled ${name}.`
      )
    },
    [persistEdits, servers]
  )

  const handleDeleteServer = useCallback(
    async (name: string): Promise<void> => {
      if (!window.confirm(`Remove the MCP server “${name}”?`)) return

      const nextServers = { ...servers }
      delete nextServers[name]

      await persistEdits(
        [{ keyPath: `mcp_servers.${name}`, value: null, mergeStrategy: 'replace' }],
        nextServers,
        `Removed ${name}.`
      )
      if (draft?.originalName === name) {
        setDraft(null)
        setValidationError(null)
      }
    },
    [draft?.originalName, persistEdits, servers]
  )

  const handleSaveDraft = useCallback(async (): Promise<void> => {
    if (!draft) return

    const trimmedName = draft.name.trim()
    if (!trimmedName) {
      setValidationError('Server name is required.')
      return
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(trimmedName)) {
      setValidationError('Use letters, numbers, dots, dashes, or underscores for the server name.')
      return
    }

    if (draft.originalName !== trimmedName && servers[trimmedName]) {
      setValidationError('A server with that name already exists.')
      return
    }

    const { env, invalidLine } = parseEnvText(draft.envText)
    if (invalidLine) {
      setValidationError(`Invalid env entry: ${invalidLine}`)
      return
    }

    if (draft.transport === 'stdio' && !draft.command.trim()) {
      setValidationError('Command is required for stdio servers.')
      return
    }

    if (draft.transport === 'url' && !draft.url.trim()) {
      setValidationError('URL is required for remote servers.')
      return
    }

    const nextConfig: McpServerConfig = {
      ...draft.preserved
    }

    if (draft.transport === 'stdio') {
      nextConfig.command = draft.command.trim()
      const args = parseArgsText(draft.argsText)
      if (args.length > 0) nextConfig.args = args
      else delete nextConfig.args
      if (Object.keys(env).length > 0) nextConfig.env = env
      else delete nextConfig.env
      delete nextConfig.url
    } else {
      nextConfig.url = draft.url.trim()
      delete nextConfig.command
      delete nextConfig.args
      delete nextConfig.env
    }

    const nextServers = { ...servers }
    const edits: Array<{ keyPath: string; value: unknown; mergeStrategy: 'replace' | 'upsert' }> =
      []

    if (draft.originalName && draft.originalName !== trimmedName) {
      delete nextServers[draft.originalName]
      edits.push({
        keyPath: `mcp_servers.${draft.originalName}`,
        value: null,
        mergeStrategy: 'replace'
      })
    }

    nextServers[trimmedName] = applyEnabledState(nextConfig, draft.enabled)
    edits.push({
      keyPath: `mcp_servers.${trimmedName}`,
      value: nextServers[trimmedName],
      mergeStrategy: 'replace'
    })

    await persistEdits(
      edits,
      nextServers,
      draft.originalName ? `Saved ${trimmedName}.` : `Added ${trimmedName}.`
    )
    setDraft(null)
    setValidationError(null)
  }, [draft, persistEdits, servers])

  return (
    <div className="mx-auto w-full max-w-5xl px-10 pb-16 pt-16">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-ui-44 font-semibold tracking-tight">MCP servers</h1>
          <p className="mt-1 max-w-2xl text-ui-15 text-muted-foreground">
            Connect external tools and data sources by editing the Codex `mcp_servers` configuration
            directly from Ross.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={saving || reloading}
            onClick={() => {
              setDraft(createMcpServerDraft(null))
              setValidationError(null)
              setNotice(null)
            }}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3.5 text-ui-13 font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add server
          </button>
          <button
            type="button"
            disabled={!loaded || saving || reloading}
            onClick={() => void reloadRuntime()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3.5 text-ui-13 font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            {reloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Reload
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div className="mt-5 space-y-2">
          {error && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-ui-13 text-red-600">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-ui-13 text-emerald-600">
              {notice}
            </div>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <section className="overflow-hidden rounded-2xl border border-border bg-secondary/20">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-ui-14 font-semibold text-foreground">Custom servers</h2>
              <p className="mt-0.5 text-ui-12 text-muted-foreground">
                {sortedServers.length} configured
              </p>
            </div>
            {saving && (
              <span className="text-ui-12 text-muted-foreground">Saving and reloading...</span>
            )}
          </div>

          {!loaded ? (
            <div className="px-4 py-12 text-center text-ui-13 text-muted-foreground">
              Loading MCP servers...
            </div>
          ) : sortedServers.length === 0 ? (
            <div className="px-4 py-12 text-center text-ui-13 text-muted-foreground">
              No MCP servers configured yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sortedServers.map(([name, config]) => {
                const enabled = config.enabled !== false
                const isEditing = draft?.originalName === name
                const isRemote = typeof config.url === 'string' && config.url.length > 0
                const runtime = runtimeStatuses[name]
                const authStatus = formatAuthStatus(runtime?.authStatus)
                const toolCount = runtime ? Object.keys(runtime.tools || {}).length : null
                const resourceCount = runtime
                  ? (runtime.resources?.length || 0) + (runtime.resourceTemplates?.length || 0)
                  : null

                return (
                  <div key={name} className="flex items-start gap-4 px-4 py-4">
                    <div
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${isRemote ? 'border-sky-500/20 bg-sky-500/10 text-sky-600' : 'border-amber-500/20 bg-amber-500/10 text-amber-600'}`}
                    >
                      {isRemote ? (
                        <Globe className="h-4.5 w-4.5" strokeWidth={1.9} />
                      ) : (
                        <TerminalSquare className="h-4.5 w-4.5" strokeWidth={1.9} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-ui-14 font-semibold text-foreground">{name}</p>
                        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-ui-11 uppercase tracking-[0.16em] text-muted-foreground">
                          {isRemote ? 'Remote' : 'stdio'}
                        </span>
                        {!enabled && (
                          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-ui-11 text-muted-foreground">
                            Disabled
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-ui-12 text-muted-foreground">
                        {summarizeMcpServer(config)}
                      </p>
                      {(toolCount !== null || authStatus || resourceCount !== null) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-ui-11 text-muted-foreground">
                          {toolCount !== null && <span>{toolCount} tools</span>}
                          {resourceCount !== null && <span>{resourceCount} resources</span>}
                          {authStatus && <span>{authStatus}</span>}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={saving || reloading}
                        onClick={() => {
                          setDraft(createMcpServerDraft(name, config))
                          setValidationError(null)
                          setNotice(null)
                        }}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50 ${isEditing ? 'text-foreground' : ''}`}
                        aria-label={`Edit ${name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={saving || reloading}
                        onClick={() => void handleDeleteServer(name)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-red-500/30 hover:text-red-600 disabled:opacity-50"
                        aria-label={`Delete ${name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <Switch
                        checked={enabled}
                        disabled={saving || reloading}
                        onCheckedChange={(next) => void handleToggleServer(name, next)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <aside className="overflow-hidden rounded-2xl border border-border bg-secondary/20">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-ui-14 font-semibold text-foreground">
              {draft ? (draft.originalName ? 'Edit server' : 'New server') : 'Server editor'}
            </h2>
            <p className="mt-0.5 text-ui-12 text-muted-foreground">
              {draft
                ? 'Configure a stdio command or a remote URL-backed MCP endpoint.'
                : 'Select an existing server or create a new one.'}
            </p>
          </div>

          {draft ? (
            <div className="space-y-4 px-4 py-4">
              <div className="space-y-1.5">
                <label className="text-ui-12 font-medium text-foreground">Name</label>
                <input
                  value={draft.name}
                  onChange={(e) => {
                    setDraft({ ...draft, name: e.target.value })
                    setValidationError(null)
                  }}
                  placeholder="playwright"
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-ui-13 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-border"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-ui-12 font-medium text-foreground">Transport</label>
                <Segmented
                  value={draft.transport}
                  onChange={(next) => {
                    setDraft({ ...draft, transport: next })
                    setValidationError(null)
                  }}
                  options={[
                    {
                      value: 'stdio',
                      label: 'stdio',
                      icon: <TerminalSquare className="h-3.5 w-3.5" />
                    },
                    { value: 'url', label: 'Remote URL', icon: <Globe className="h-3.5 w-3.5" /> }
                  ]}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5">
                <div>
                  <p className="text-ui-13 font-medium text-foreground">Enabled</p>
                  <p className="text-ui-12 text-muted-foreground">
                    Disabled servers stay in config but do not load.
                  </p>
                </div>
                <Switch
                  checked={draft.enabled}
                  onCheckedChange={(next) => setDraft({ ...draft, enabled: next })}
                />
              </div>

              {draft.transport === 'stdio' ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-ui-12 font-medium text-foreground">Command</label>
                    <input
                      value={draft.command}
                      onChange={(e) => {
                        setDraft({ ...draft, command: e.target.value })
                        setValidationError(null)
                      }}
                      placeholder="npx"
                      className="h-10 w-full rounded-xl border border-border bg-background px-3 text-ui-13 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-border"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-ui-12 font-medium text-foreground">Arguments</label>
                    <textarea
                      value={draft.argsText}
                      onChange={(e) => setDraft({ ...draft, argsText: e.target.value })}
                      placeholder="@playwright/mcp@latest"
                      className="h-28 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-ui-13 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-border"
                    />
                    <p className="text-ui-11 text-muted-foreground">One argument per line.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-ui-12 font-medium text-foreground">
                      Environment variables
                    </label>
                    <textarea
                      value={draft.envText}
                      onChange={(e) => {
                        setDraft({ ...draft, envText: e.target.value })
                        setValidationError(null)
                      }}
                      placeholder="API_KEY=example"
                      className="h-28 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-ui-13 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-border"
                    />
                    <p className="text-ui-11 text-muted-foreground">Use `KEY=value` per line.</p>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-ui-12 font-medium text-foreground">URL</label>
                  <input
                    value={draft.url}
                    onChange={(e) => {
                      setDraft({ ...draft, url: e.target.value })
                      setValidationError(null)
                    }}
                    placeholder="https://example.com/mcp"
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-ui-13 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-border"
                  />
                </div>
              )}

              {Object.keys(draft.preserved).length > 0 && (
                <div className="rounded-xl border border-border bg-background px-3 py-2.5">
                  <p className="text-ui-12 font-medium text-foreground">
                    Advanced fields preserved
                  </p>
                  <p className="mt-0.5 text-ui-11 text-muted-foreground">
                    {Object.keys(draft.preserved).join(', ')}
                  </p>
                </div>
              )}

              {validationError && (
                <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2.5 text-ui-12 text-red-600">
                  {validationError}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setDraft(null)
                    setValidationError(null)
                  }}
                  className="h-9 rounded-lg border border-border bg-background px-3.5 text-ui-13 font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveDraft()}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-3.5 text-ui-13 font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {draft.originalName ? 'Save changes' : 'Create server'}
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4 py-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background text-muted-foreground">
                <Server className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <p className="mt-4 text-ui-13 font-medium text-foreground">
                Ready for your next connection
              </p>
              <p className="mx-auto mt-1 max-w-[240px] text-ui-12 text-muted-foreground">
                Add a new MCP server or edit one from the list to connect tools, docs, or remote
                services.
              </p>
              <button
                type="button"
                disabled={saving || reloading}
                onClick={() => {
                  setDraft(createMcpServerDraft(null))
                  setValidationError(null)
                }}
                className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3.5 text-ui-13 font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add server
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

export default function SettingsTab(): ReactElement {
  const { setActiveTab, settings, themes, setThemes, updateSettings } = useCodexStore()
  const [activePage, setActivePage] = useState<SettingsPage>('General')
  const [isImportingTheme, setIsImportingTheme] = useState(false)
  const [deletingThemeId, setDeletingThemeId] = useState<string | null>(null)
  const [themeSearch, setThemeSearch] = useState('')
  const [showAllThemes, setShowAllThemes] = useState(false)

  const VISIBLE_THEME_COUNT = 4
  const { containerRef, isResizing, handlePointerDown } = useResizableSidebar({
    width: settings.settingsSidebarWidth,
    minWidth: SETTINGS_SIDEBAR_MIN_WIDTH,
    maxWidth: SETTINGS_SIDEBAR_MAX_WIDTH,
    onWidthChange: (settingsSidebarWidth) => updateSettings({ settingsSidebarWidth })
  })

  const filteredThemes = useMemo(() => {
    const query = themeSearch.trim().toLowerCase()
    if (!query) return themes
    return themes.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.author?.toLowerCase().includes(query)
    )
  }, [themes, themeSearch])

  const isSearching = themeSearch.trim().length > 0
  const hasHiddenThemes = !isSearching && filteredThemes.length > VISIBLE_THEME_COUNT
  const visibleThemes =
    isSearching || showAllThemes ? filteredThemes : filteredThemes.slice(0, VISIBLE_THEME_COUNT)
  const hiddenCount = filteredThemes.length - VISIBLE_THEME_COUNT

  const handleImportTheme = useCallback(async (): Promise<void> => {
    try {
      setIsImportingTheme(true)
      const result = await window.codex.importTheme()
      if (!result) return

      setThemes(result.themes)
      updateSettings(buildThemeSelectionSettings(result.imported))
      toast.success(`Imported ${result.imported.name}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import theme.'
      toast.error(message)
    } finally {
      setIsImportingTheme(false)
    }
  }, [setThemes, updateSettings])

  const handleDeleteTheme = useCallback(
    async (themeId: string): Promise<void> => {
      try {
        setDeletingThemeId(themeId)
        const result = await window.codex.deleteTheme(themeId)
        setThemes(result.themes)

        if (settings.themeId === themeId) {
          const fallbackTheme = result.themes.find((theme) => theme.id === DEFAULT_THEME_ID)
          if (fallbackTheme) {
            updateSettings(buildThemeSelectionSettings(fallbackTheme))
          } else {
            updateSettings({ themeId: DEFAULT_THEME_ID })
          }
        }

        toast.success('Theme deleted')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete theme.'
        toast.error(message)
      } finally {
        setDeletingThemeId(null)
      }
    },
    [setThemes, settings.themeId, updateSettings]
  )

  return (
    <div className="h-full min-h-0 text-foreground">
      <div className="flex h-full min-h-0 overflow-hidden">
        <div
          ref={containerRef}
          className="sidebar-resize-shell h-full"
          style={{ width: settings.settingsSidebarWidth }}
        >
          <aside className="sidebar-glass h-full w-full border-r border-border px-3 pt-14">
            <button
              type="button"
              onClick={() => setActiveTab('threads')}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-ui-13 text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.9} />
              Back to app
            </button>

            <nav className="mt-3 space-y-0.5 pr-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const isActive = item.label === activePage
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setActivePage(item.label)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui-15 transition-colors ${isActive ? 'bg-sidebar-active text-sidebar-foreground' : 'text-sidebar-foreground hover:bg-sidebar-hover'}`}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                    {item.label}
                  </button>
                )
              })}
            </nav>
          </aside>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize settings sidebar"
            data-active={isResizing}
            onPointerDown={handlePointerDown}
            className="sidebar-resize-handle no-drag"
          />
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background">
          <AnimatePresence mode="wait">
          {activePage === 'Configuration' && (
            <motion.div
              key="configuration"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: ANIMATION_EASE }}
            >
              <ConfigurationPage />
            </motion.div>
          )}
          {activePage === 'MCP servers' && (
            <motion.div
              key="mcp"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: ANIMATION_EASE }}
            >
              <McpServersPage />
            </motion.div>
          )}
          {activePage === 'Personalization' && (
            <motion.div
              key="personalization"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: ANIMATION_EASE }}
            >
              <PersonalizationPage />
            </motion.div>
          )}
          {activePage === 'General' && (
            <motion.div
              key="general"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: ANIMATION_EASE }}
            >
            <div className="mx-auto w-full max-w-2xl px-10 pb-12 pt-16">
              <h1 className="text-ui-44 font-semibold tracking-tight">General</h1>

              <section className="mt-5 overflow-hidden rounded-xl border border-border bg-secondary/25">
                <SettingRow
                  title="Default editor"
                  description="Open file links from assistant responses in this app"
                  control={
                    <select
                      value={settings.defaultOpenDestination}
                      onChange={(e) =>
                        updateSettings({
                          defaultOpenDestination: e.target.value as
                            | 'cursor'
                            | 'zed'
                            | 'vscode'
                            | 'ghostty'
                        })
                      }
                      className="h-8 min-w-[290px] rounded-lg border border-border bg-background px-2.5 text-ui-13"
                    >
                      {FILE_EDITOR_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  }
                />
                <SettingRow
                  title="Language"
                  description="Language for the app UI"
                  control={
                    <select
                      value={settings.language}
                      onChange={(e) =>
                        updateSettings({ language: e.target.value as 'auto' | 'en' })
                      }
                      className="h-8 min-w-[290px] rounded-lg border border-border bg-background px-2.5 text-ui-13"
                    >
                      <option value="auto">Auto Detect</option>
                      <option value="en">English</option>
                    </select>
                  }
                />
                <SettingRow
                  title="Thread detail"
                  description="Choose how much command output to show in threads"
                  control={
                    <select
                      value={settings.threadDetail}
                      onChange={(e) =>
                        updateSettings({
                          threadDetail: e.target.value as
                            | 'steps_with_code_commands'
                            | 'assistant_only'
                        })
                      }
                      className="h-8 min-w-[290px] rounded-lg border border-border bg-background px-2.5 text-ui-13"
                    >
                      <option value="steps_with_code_commands">Steps with code commands</option>
                      <option value="assistant_only">Assistant response only</option>
                    </select>
                  }
                />
                <SettingRow
                  title="Prevent sleep while running"
                  description="Keep your computer awake while Codex is running a thread."
                  control={
                    <Switch
                      checked={settings.preventSleepWhileRunning}
                      onCheckedChange={(next) => updateSettings({ preventSleepWhileRunning: next })}
                    />
                  }
                />
                <SettingRow
                  title="Require ⌘ + enter to send long prompts"
                  description="When enabled, multiline prompts require ⌘ + enter to send."
                  control={
                    <Switch
                      checked={settings.requireMetaForMultiline}
                      onCheckedChange={(next) => updateSettings({ requireMetaForMultiline: next })}
                    />
                  }
                />
                <SettingRow
                  title="Speed"
                  description="Standard uses the default tier. Fast enables priority processing for quicker runs and higher credit usage."
                  control={
                    <select
                      value={settings.speed}
                      onChange={(e) =>
                        updateSettings({ speed: e.target.value as 'standard' | 'fast' })
                      }
                      className="h-8 min-w-[290px] rounded-lg border border-border bg-background px-2.5 text-ui-13"
                    >
                      <option value="standard">Standard</option>
                      <option value="fast">Fast</option>
                    </select>
                  }
                />
                <SettingRow
                  title="Follow-up behavior"
                  description="Queue follow-ups while Codex runs or replace the current run with a new follow-up. Press ⇧⌘Enter to do the opposite for one message."
                  control={
                    <Segmented
                      value={settings.followUpBehavior}
                      onChange={(next) => updateSettings({ followUpBehavior: next })}
                      options={[
                        { value: 'queue', label: 'Queue' },
                        { value: 'steer', label: 'Steer' }
                      ]}
                    />
                  }
                />
              </section>

              <h2 className="mt-7 text-ui-38 font-semibold tracking-tight">Appearance</h2>
              <section className="mt-3 overflow-hidden rounded-xl border border-border bg-secondary/25">
                <SettingRow
                  title="Mode"
                  description="Choose a light or dark presentation, or follow your system setting"
                  control={
                    <Segmented
                      value={settings.themeMode}
                      onChange={(next) => updateSettings({ themeMode: next as ThemePreference })}
                      options={[
                        {
                          value: 'light',
                          label: 'Light',
                          icon: <Sun className="h-3.5 w-3.5" strokeWidth={1.75} />
                        },
                        {
                          value: 'dark',
                          label: 'Dark',
                          icon: <Moon className="h-3.5 w-3.5" strokeWidth={1.75} />
                        },
                        {
                          value: 'system',
                          label: 'System',
                          icon: <Monitor className="h-3.5 w-3.5" strokeWidth={1.75} />
                        }
                      ]}
                    />
                  }
                />
                <div className="border-t border-border px-3 py-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-ui-13 font-medium text-foreground">Themes</p>
                      <p className="mt-0.5 max-w-[560px] text-ui-12 text-muted-foreground">
                        Select a built-in theme family or import your own `.json` theme file.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleImportTheme()}
                      disabled={isImportingTheme}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/25 px-3 py-2 text-ui-13 text-foreground transition-colors duration-150 hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isImportingTheme ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.9} />
                      ) : (
                        <Plus className="h-3.5 w-3.5" strokeWidth={1.9} />
                      )}
                      Import Theme
                    </button>
                  </div>

                  <div className="relative mt-3">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                      strokeWidth={1.9}
                    />
                    <input
                      type="text"
                      value={themeSearch}
                      onChange={(e) => {
                        setThemeSearch(e.target.value)
                        setShowAllThemes(false)
                      }}
                      placeholder="Search themes…"
                      className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-ui-13 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-border"
                    />
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {visibleThemes.map((theme) => (
                      <ThemeCard
                        key={theme.id}
                        theme={theme}
                        selected={theme.id === settings.themeId}
                        onSelect={(themeId) => {
                          const selectedTheme = themes.find((entry) => entry.id === themeId)
                          if (!selectedTheme) return
                          updateSettings(buildThemeSelectionSettings(selectedTheme))
                        }}
                        onDelete={theme.source === 'imported' ? handleDeleteTheme : undefined}
                        isDeleting={deletingThemeId === theme.id}
                      />
                    ))}
                  </div>

                  {isSearching && filteredThemes.length === 0 ? (
                    <p className="mt-3 text-center text-ui-12 text-muted-foreground">
                      No themes match your search.
                    </p>
                  ) : null}

                  {hasHiddenThemes ? (
                    <button
                      type="button"
                      onClick={() => setShowAllThemes((prev) => !prev)}
                      className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-ui-12 text-muted-foreground transition-colors duration-150 hover:bg-secondary/50 hover:text-foreground"
                    >
                      {showAllThemes ? (
                        <>
                          Show less
                          <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.9} />
                        </>
                      ) : (
                        <>
                          Show {hiddenCount} more
                          <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.9} />
                        </>
                      )}
                    </button>
                  ) : null}
                </div>
                <SettingRow
                  title="Use opaque window background"
                  description="Make windows use a solid background rather than system translucency"
                  control={
                    <Switch
                      checked={settings.opaqueWindowBackground}
                      onCheckedChange={(next) => updateSettings({ opaqueWindowBackground: next })}
                    />
                  }
                />
                <SettingRow
                  title="Use pointer cursors"
                  description="Change the cursor to a pointer when hovering over interactive elements"
                  control={
                    <Switch
                      checked={settings.pointerCursors}
                      onCheckedChange={(next) => updateSettings({ pointerCursors: next })}
                    />
                  }
                />
                <FontSettingRow
                  title="Sans font family"
                  description="Adjust the font used for the Codex UI"
                  sizeValue={settings.sansFontSize}
                  sizeMin={UI_SANS_FONT_SIZE_MIN}
                  sizeMax={UI_SANS_FONT_SIZE_MAX}
                  onSizeChange={(next) => updateSettings({ sansFontSize: clampSansFontSize(next) })}
                  fontValue={settings.sansFontFamily}
                  onFontChange={(next) => updateSettings({ sansFontFamily: next })}
                  kind="sans"
                />
                <FontSettingRow
                  title="Code font"
                  description="Adjust font and size used for code across chats and diffs"
                  sizeValue={settings.codeFontSize}
                  sizeMin={UI_CODE_FONT_SIZE_MIN}
                  sizeMax={UI_CODE_FONT_SIZE_MAX}
                  onSizeChange={(next) => updateSettings({ codeFontSize: clampCodeFontSize(next) })}
                  fontValue={settings.codeFontFamily}
                  onFontChange={(next) => updateSettings({ codeFontFamily: next })}
                  kind="code"
                />
              </section>

              <h2 className="mt-7 text-ui-38 font-semibold tracking-tight">Notifications</h2>
              <section className="mt-3 rounded-xl border border-border bg-secondary/25 px-3 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-ui-13 font-medium text-foreground">
                      Thread completion chime
                    </p>
                    <p className="mt-0.5 text-ui-12 text-muted-foreground">
                      Play a subtle sound when a response finishes streaming.
                    </p>
                  </div>
                  <Switch
                    checked={settings.notificationChime}
                    onCheckedChange={(next) => updateSettings({ notificationChime: next })}
                  />
                </div>
              </section>
            </div>
            </motion.div>
          )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
