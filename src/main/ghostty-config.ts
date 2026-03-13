import { existsSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface GhosttyAppearance {
  fontFamily?: string
  fontSize?: number
  scrollbackLimit?: number
  windowPaddingX?: number
  windowPaddingY?: number
  background?: string
  foreground?: string
  cursor?: string
  cursorAccent?: string
  selectionBackground?: string
  selectionForeground?: string
  splitDividerColor?: string
  black?: string
  red?: string
  green?: string
  yellow?: string
  blue?: string
  magenta?: string
  cyan?: string
  white?: string
  brightBlack?: string
  brightRed?: string
  brightGreen?: string
  brightYellow?: string
  brightBlue?: string
  brightMagenta?: string
  brightCyan?: string
  brightWhite?: string
}

interface ParsedGhosttyConfig {
  loaded: boolean
  fontFamily?: string
  fontSize?: number
  theme?: string
  scrollbackLimit?: number
  windowPaddingX?: number
  windowPaddingY?: number
  background?: string
  foreground?: string
  cursor?: string
  cursorAccent?: string
  selectionBackground?: string
  selectionForeground?: string
  splitDividerColor?: string
  palette: Map<number, string>
}

const GHOSTTY_CONFIG_PATHS = [
  '~/.config/ghostty/config',
  '~/.config/ghostty/config.ghostty',
  '~/Library/Application Support/com.mitchellh.ghostty/config',
  '~/Library/Application Support/com.mitchellh.ghostty/config.ghostty'
]

function expandTilde(inputPath: string): string {
  if (inputPath === '~') return homedir()
  if (inputPath.startsWith('~/')) return join(homedir(), inputPath.slice(2))
  return inputPath
}

function readNonEmptyFile(filePath: string): string | null {
  const resolvedPath = expandTilde(filePath)
  if (!existsSync(resolvedPath)) return null

  const stats = statSync(resolvedPath, { throwIfNoEntry: false })
  if (!stats?.isFile() || stats.size === 0) return null

  return readFileSync(resolvedPath, 'utf8')
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function normalizeHexColor(value: string): string | null {
  const normalized = value.trim().replace(/^#/, '')
  return /^[0-9a-fA-F]{6}$/.test(normalized) ? `#${normalized.toLowerCase()}` : null
}

function createParsedConfig(): ParsedGhosttyConfig {
  return {
    loaded: false,
    palette: new Map()
  }
}

function parseIntoConfig(target: ParsedGhosttyConfig, contents: string): void {
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    const value = stripQuotes(line.slice(separatorIndex + 1).trim())
    target.loaded = true

    switch (key) {
      case 'font-family':
        target.fontFamily = value
        break
      case 'font-size': {
        const size = Number(value)
        if (Number.isFinite(size) && size > 0) {
          target.fontSize = size
        }
        break
      }
      case 'theme':
        target.theme = value
        break
      case 'scrollback-limit': {
        const limit = Number.parseInt(value, 10)
        if (Number.isFinite(limit) && limit > 0) {
          target.scrollbackLimit = limit
        }
        break
      }
      case 'window-padding-x': {
        const padding = Number(value)
        if (Number.isFinite(padding) && padding >= 0) {
          target.windowPaddingX = padding
        }
        break
      }
      case 'window-padding-y': {
        const padding = Number(value)
        if (Number.isFinite(padding) && padding >= 0) {
          target.windowPaddingY = padding
        }
        break
      }
      case 'background':
        target.background = normalizeHexColor(value) ?? target.background
        break
      case 'foreground':
        target.foreground = normalizeHexColor(value) ?? target.foreground
        break
      case 'cursor-color':
        target.cursor = normalizeHexColor(value) ?? target.cursor
        break
      case 'cursor-text':
        target.cursorAccent = normalizeHexColor(value) ?? target.cursorAccent
        break
      case 'selection-background':
        target.selectionBackground = normalizeHexColor(value) ?? target.selectionBackground
        break
      case 'selection-foreground':
        target.selectionForeground = normalizeHexColor(value) ?? target.selectionForeground
        break
      case 'split-divider-color':
        target.splitDividerColor = normalizeHexColor(value) ?? target.splitDividerColor
        break
      case 'palette': {
        const paletteSeparator = value.indexOf('=')
        if (paletteSeparator === -1) break

        const index = Number.parseInt(value.slice(0, paletteSeparator).trim(), 10)
        const color = normalizeHexColor(value.slice(paletteSeparator + 1))
        if (Number.isInteger(index) && index >= 0 && index <= 15 && color) {
          target.palette.set(index, color)
        }
        break
      }
      default:
        break
    }
  }
}

function resolveThemeName(rawThemeValue: string, preferDark: boolean): string {
  let fallbackTheme: string | null = null
  let lightTheme: string | null = null
  let darkTheme: string | null = null

  for (const token of rawThemeValue.split(',')) {
    const entry = token.trim()
    if (!entry) continue

    const separatorIndex = entry.indexOf(':')
    if (separatorIndex === -1) {
      fallbackTheme ??= entry
      continue
    }

    const key = entry.slice(0, separatorIndex).trim().toLowerCase()
    const value = entry.slice(separatorIndex + 1).trim()
    if (!value) continue

    if (key === 'light') {
      lightTheme ??= value
    } else if (key === 'dark') {
      darkTheme ??= value
    } else {
      fallbackTheme ??= value
    }
  }

  if (preferDark && darkTheme) return darkTheme
  if (!preferDark && lightTheme) return lightTheme
  if (fallbackTheme) return fallbackTheme
  if (darkTheme) return darkTheme
  if (lightTheme) return lightTheme
  return rawThemeValue.trim()
}

function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (match) => match.toUpperCase())
}

function themeNameCandidates(rawName: string): string[] {
  const candidates: string[] = []

  const appendCandidate = (value: string): void => {
    const trimmed = value.trim()
    if (!trimmed || candidates.includes(trimmed)) return
    candidates.push(trimmed)
  }

  appendCandidate(rawName)

  const withoutConf = rawName.replace(/\.conf$/i, '')
  appendCandidate(withoutConf)
  appendCandidate(`${withoutConf}.conf`)

  const spaced = withoutConf.replace(/[-_]+/g, ' ')
  appendCandidate(spaced)
  appendCandidate(toTitleCase(spaced))

  return candidates
}

function themeSearchPaths(themeName: string): string[] {
  const paths: string[] = []

  const appendPath = (filePath: string): void => {
    const resolvedPath = expandTilde(filePath)
    if (!paths.includes(resolvedPath)) {
      paths.push(resolvedPath)
    }
  }

  const resourcesDir = process.env.GHOSTTY_RESOURCES_DIR
  if (resourcesDir) {
    appendPath(join(resourcesDir, 'themes', themeName))
  }

  appendPath(`/Applications/Ghostty.app/Contents/Resources/ghostty/themes/${themeName}`)
  appendPath(`~/.config/ghostty/themes/${themeName}`)
  appendPath(`~/Library/Application Support/com.mitchellh.ghostty/themes/${themeName}`)

  return paths
}

function loadThemeIntoConfig(target: ParsedGhosttyConfig, preferDark: boolean): void {
  if (!target.theme) return

  const resolvedThemeName = resolveThemeName(target.theme, preferDark)
  for (const candidate of themeNameCandidates(resolvedThemeName)) {
    for (const candidatePath of themeSearchPaths(candidate)) {
      const contents = readNonEmptyFile(candidatePath)
      if (!contents) continue

      parseIntoConfig(target, contents)
      return
    }
  }
}

export function loadGhosttyAppearance(preferDark: boolean): GhosttyAppearance | null {
  const config = createParsedConfig()

  for (const configPath of GHOSTTY_CONFIG_PATHS) {
    const contents = readNonEmptyFile(configPath)
    if (contents) {
      parseIntoConfig(config, contents)
    }
  }

  loadThemeIntoConfig(config, preferDark)

  if (!config.loaded) {
    return null
  }

  return {
    fontFamily: config.fontFamily,
    fontSize: config.fontSize,
    scrollbackLimit: config.scrollbackLimit,
    windowPaddingX: config.windowPaddingX,
    windowPaddingY: config.windowPaddingY,
    background: config.background,
    foreground: config.foreground,
    cursor: config.cursor,
    cursorAccent: config.cursorAccent,
    selectionBackground: config.selectionBackground,
    selectionForeground: config.selectionForeground,
    splitDividerColor: config.splitDividerColor,
    black: config.palette.get(0),
    red: config.palette.get(1),
    green: config.palette.get(2),
    yellow: config.palette.get(3),
    blue: config.palette.get(4),
    magenta: config.palette.get(5),
    cyan: config.palette.get(6),
    white: config.palette.get(7),
    brightBlack: config.palette.get(8),
    brightRed: config.palette.get(9),
    brightGreen: config.palette.get(10),
    brightYellow: config.palette.get(11),
    brightBlue: config.palette.get(12),
    brightMagenta: config.palette.get(13),
    brightCyan: config.palette.get(14),
    brightWhite: config.palette.get(15)
  }
}
