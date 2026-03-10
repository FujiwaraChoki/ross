import type { AppSettings } from '@/lib/store'
import {
  DEFAULT_THEME_ID,
  THEME_TOKEN_KEYS,
  getBuiltInThemeById,
  type ThemeCatalogEntry,
  type ThemeMode,
  type ThemePreference,
  type ThemeTokenKey
} from '../../../shared/theme'

/** Bundled sans fonts that ship with the app */
export const BUNDLED_SANS_FONTS = ['DM Sans', 'Geist', 'System'] as const
/** Bundled code fonts that ship with the app */
export const BUNDLED_CODE_FONTS = ['SF Mono', 'Geist Mono', 'Menlo', 'Monaco'] as const
export const UI_FONT_SIZE_STEP = 1
export const UI_SANS_FONT_SIZE_DEFAULT = 14
export const UI_CODE_FONT_SIZE_DEFAULT = 13
export const UI_SANS_FONT_SIZE_MIN = 11
export const UI_SANS_FONT_SIZE_MAX = 30
export const UI_CODE_FONT_SIZE_MIN = 11
export const UI_CODE_FONT_SIZE_MAX = 30

/** Known bundled-font → CSS font-stack mappings */
const SANS_STACKS: Record<string, string> = {
  'DM Sans': "'DM Sans Variable', system-ui, -apple-system, sans-serif",
  Geist: "'Geist Variable', system-ui, -apple-system, sans-serif",
  System: 'system-ui, -apple-system, sans-serif'
}

const CODE_STACKS: Record<string, string> = {
  'SF Mono': "'SF Mono', Menlo, Monaco, ui-monospace, monospace",
  'Geist Mono': "'Geist Mono Variable', 'SF Mono', Menlo, Monaco, ui-monospace, monospace",
  Menlo: "Menlo, 'SF Mono', Monaco, ui-monospace, monospace",
  Monaco: "Monaco, 'SF Mono', Menlo, ui-monospace, monospace"
}

const THEME_TOKEN_TO_CSS_VARIABLE: Record<ThemeTokenKey, string> = {
  background: '--background',
  foreground: '--foreground',
  accent: '--accent',
  accentForeground: '--accent-foreground',
  card: '--card',
  cardForeground: '--card-foreground',
  popover: '--popover',
  popoverForeground: '--popover-foreground',
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  secondary: '--secondary',
  secondaryForeground: '--secondary-foreground',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  destructive: '--destructive',
  border: '--border',
  input: '--input',
  ring: '--ring',
  sidebar: '--sidebar',
  sidebarForeground: '--sidebar-foreground',
  sidebarPrimary: '--sidebar-primary',
  sidebarPrimaryForeground: '--sidebar-primary-foreground',
  sidebarAccent: '--sidebar-accent',
  sidebarAccentForeground: '--sidebar-accent-foreground',
  sidebarBorder: '--sidebar-border',
  sidebarRing: '--sidebar-ring',
  sidebarMuted: '--sidebar-muted',
  sidebarHover: '--sidebar-hover',
  sidebarActive: '--sidebar-active',
  sidebarTint: '--sidebar-tint',
  sidebarGlow: '--sidebar-glow',
  terminalBg: '--terminal-bg'
}

function quote(name: string): string {
  return name.includes(' ') ? `'${name}'` : name
}

function resolveSansFontFamily(name: string): string {
  return SANS_STACKS[name] ?? `${quote(name)}, system-ui, -apple-system, sans-serif`
}

function resolveCodeFontFamily(name: string): string {
  return CODE_STACKS[name] ?? `${quote(name)}, ui-monospace, monospace`
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function resolveFallbackTheme(): ThemeCatalogEntry {
  return getBuiltInThemeById(DEFAULT_THEME_ID) || getBuiltInThemeById('ross')!
}

function applyThemeMode(themePreference: ThemePreference): ThemeMode {
  const root = document.documentElement
  const resolvedMode = resolveThemeMode(themePreference)

  root.setAttribute('data-theme', resolvedMode)
  root.classList.remove('light', 'dark')
  root.classList.add(resolvedMode)
  localStorage.setItem('theme', themePreference)

  return resolvedMode
}

function applyThemeTokens(theme: ThemeCatalogEntry, mode: ThemeMode): void {
  const root = document.documentElement
  const palette = theme.tokens[mode]

  for (const tokenKey of THEME_TOKEN_KEYS) {
    root.style.setProperty(THEME_TOKEN_TO_CSS_VARIABLE[tokenKey], palette[tokenKey])
  }
}

export function clampSansFontSize(value: number): number {
  return clampNumber(value, UI_SANS_FONT_SIZE_MIN, UI_SANS_FONT_SIZE_MAX)
}

export function clampCodeFontSize(value: number): number {
  return clampNumber(value, UI_CODE_FONT_SIZE_MIN, UI_CODE_FONT_SIZE_MAX)
}

export function resolveThemeMode(themePreference: ThemePreference): ThemeMode {
  if (themePreference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  return themePreference
}

export function subscribeToSystemThemeChanges(callback: () => void): () => void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleChange = (): void => callback()
  mediaQuery.addEventListener('change', handleChange)
  return () => mediaQuery.removeEventListener('change', handleChange)
}

export function applyUiPreferences(
  settings: AppSettings,
  selectedTheme?: ThemeCatalogEntry
): ThemeMode {
  const root = document.documentElement
  const activeTheme = selectedTheme || resolveFallbackTheme()
  const resolvedMode = applyThemeMode(settings.themeMode)

  applyThemeTokens(activeTheme, resolvedMode)

  root.classList.toggle('use-pointer-cursors', settings.pointerCursors)
  root.classList.toggle('opaque-window-background', settings.opaqueWindowBackground)

  const scale = settings.sansFontSize / UI_SANS_FONT_SIZE_DEFAULT
  window.codex.setZoomFactor(scale)

  // Code font size must compensate for the zoom factor so it renders at the intended absolute size.
  root.style.setProperty('--app-code-font-size', `${settings.codeFontSize / scale}px`)
  root.style.setProperty('--app-sans-font-family', resolveSansFontFamily(settings.sansFontFamily))
  root.style.setProperty('--app-code-font-family', resolveCodeFontFamily(settings.codeFontFamily))

  return resolvedMode
}
