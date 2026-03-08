import type { AppSettings, ThemePreference } from '@/lib/store'

/** Bundled sans fonts that ship with the app */
export const BUNDLED_SANS_FONTS = ['Geist', 'System'] as const
/** Bundled code fonts that ship with the app */
export const BUNDLED_CODE_FONTS = ['SF Mono', 'Geist Mono', 'Menlo', 'Monaco'] as const

/** Known bundled-font → CSS font-stack mappings */
const SANS_STACKS: Record<string, string> = {
  Geist: "'Geist Variable', system-ui, -apple-system, sans-serif",
  System: 'system-ui, -apple-system, sans-serif'
}

const CODE_STACKS: Record<string, string> = {
  'SF Mono': "'SF Mono', Menlo, Monaco, ui-monospace, monospace",
  'Geist Mono': "'Geist Mono Variable', 'SF Mono', Menlo, Monaco, ui-monospace, monospace",
  Menlo: "Menlo, 'SF Mono', Monaco, ui-monospace, monospace",
  Monaco: "Monaco, 'SF Mono', Menlo, ui-monospace, monospace"
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

export function applyThemePreference(theme: ThemePreference): void {
  const root = document.documentElement
  if (theme === 'system') {
    root.removeAttribute('data-theme')
    root.classList.remove('dark', 'light')
  } else {
    root.setAttribute('data-theme', theme)
    root.classList.remove('dark', 'light')
    root.classList.add(theme)
  }

  localStorage.setItem('theme', theme)
}

export function applyUiPreferences(settings: AppSettings): void {
  const root = document.documentElement

  applyThemePreference(settings.theme)

  root.classList.toggle('use-pointer-cursors', settings.pointerCursors)
  root.classList.toggle('opaque-window-background', settings.opaqueWindowBackground)

  root.style.setProperty('--app-ui-font-size', `${settings.sansFontSize}px`)
  root.style.setProperty('--app-code-font-size', `${settings.codeFontSize}px`)
  root.style.setProperty('--app-sans-font-family', resolveSansFontFamily(settings.sansFontFamily))
  root.style.setProperty('--app-code-font-family', resolveCodeFontFamily(settings.codeFontFamily))
}
