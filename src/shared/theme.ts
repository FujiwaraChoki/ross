export type ThemeMode = 'light' | 'dark'
export type ThemePreference = ThemeMode | 'system'
export type ThemeSource = 'built-in' | 'imported'

export const THEME_TOKEN_KEYS = [
  'background',
  'foreground',
  'accent',
  'accentForeground',
  'card',
  'cardForeground',
  'popover',
  'popoverForeground',
  'primary',
  'primaryForeground',
  'secondary',
  'secondaryForeground',
  'muted',
  'mutedForeground',
  'destructive',
  'border',
  'input',
  'ring',
  'sidebar',
  'sidebarForeground',
  'sidebarPrimary',
  'sidebarPrimaryForeground',
  'sidebarAccent',
  'sidebarAccentForeground',
  'sidebarBorder',
  'sidebarRing',
  'sidebarMuted',
  'sidebarHover',
  'sidebarActive',
  'sidebarTint',
  'sidebarGlow',
  'terminalBg'
] as const

export type ThemeTokenKey = (typeof THEME_TOKEN_KEYS)[number]
export type ThemeTokens = Record<ThemeTokenKey, string>

export interface ThemeFonts {
  sans?: string
  code?: string
}

export interface ThemeDefinition {
  version: 1
  id: string
  name: string
  author?: string
  description?: string
  fonts?: ThemeFonts
  tokens: Record<ThemeMode, ThemeTokens>
}

export interface ThemeCatalogEntry extends ThemeDefinition {
  source: ThemeSource
}

type ThemeValidationResult = { ok: true; theme: ThemeDefinition } | { ok: false; error: string }

const ROSS_LIGHT_TOKENS: ThemeTokens = {
  background: '#ffffff',
  foreground: '#1a1a1a',
  accent: '#88fade',
  accentForeground: '#0a0a0a',
  card: '#ffffff',
  cardForeground: '#1a1a1a',
  popover: '#ffffff',
  popoverForeground: '#1a1a1a',
  primary: '#1a1a1a',
  primaryForeground: '#ffffff',
  secondary: '#f5f5f5',
  secondaryForeground: '#1a1a1a',
  muted: '#f5f5f5',
  mutedForeground: '#737373',
  destructive: 'oklch(0.58 0.22 27)',
  border: 'rgba(0, 0, 0, 0.06)',
  input: 'rgba(0, 0, 0, 0.08)',
  ring: 'rgba(0, 0, 0, 0.12)',
  sidebar: 'rgba(248, 247, 244, 0.72)',
  sidebarForeground: '#1a1a1a',
  sidebarPrimary: '#1a1a1a',
  sidebarPrimaryForeground: '#ffffff',
  sidebarAccent: 'rgba(255, 255, 255, 0.52)',
  sidebarAccentForeground: '#1a1a1a',
  sidebarBorder: 'rgba(0, 0, 0, 0.06)',
  sidebarRing: 'rgba(0, 0, 0, 0.12)',
  sidebarMuted: '#8b8b8b',
  sidebarHover: 'rgba(0, 0, 0, 0.04)',
  sidebarActive: 'rgba(0, 0, 0, 0.07)',
  sidebarTint: 'rgba(255, 255, 255, 0.38)',
  sidebarGlow: 'rgba(255, 255, 255, 0.24)',
  terminalBg: '#f5f5f5'
}

const ROSS_DARK_TOKENS: ThemeTokens = {
  background: '#181818',
  foreground: '#e5e5e5',
  accent: '#88fade',
  accentForeground: '#0a0a0a',
  card: '#181818',
  cardForeground: '#e5e5e5',
  popover: '#161616',
  popoverForeground: '#e5e5e5',
  primary: '#e5e5e5',
  primaryForeground: '#0a0a0a',
  secondary: '#202020',
  secondaryForeground: '#e5e5e5',
  muted: '#202020',
  mutedForeground: '#919191',
  destructive: 'oklch(0.58 0.22 27)',
  border: 'rgba(255, 255, 255, 0.08)',
  input: 'rgba(255, 255, 255, 0.08)',
  ring: 'rgba(255, 255, 255, 0.12)',
  sidebar: 'rgba(30, 30, 28, 0.88)',
  sidebarForeground: '#e8e8e8',
  sidebarPrimary: '#e5e5e5',
  sidebarPrimaryForeground: '#0a0a0a',
  sidebarAccent: 'rgba(255, 255, 255, 0.05)',
  sidebarAccentForeground: '#e5e5e5',
  sidebarBorder: 'rgba(255, 255, 255, 0.07)',
  sidebarRing: 'rgba(255, 255, 255, 0.12)',
  sidebarMuted: '#7a7a7a',
  sidebarHover: 'rgba(255, 255, 255, 0.04)',
  sidebarActive: 'rgba(255, 255, 255, 0.07)',
  sidebarTint: 'rgba(8, 8, 6, 0.22)',
  sidebarGlow: 'rgba(160, 130, 70, 0.04)',
  terminalBg: '#181818'
}

export const BUILT_IN_THEMES: ThemeCatalogEntry[] = [
  {
    version: 1,
    id: 'ross',
    name: 'Ross',
    description: 'The default Ross palette.',
    fonts: {
      sans: 'System',
      code: 'SF Mono'
    },
    source: 'built-in',
    tokens: {
      light: ROSS_LIGHT_TOKENS,
      dark: ROSS_DARK_TOKENS
    }
  },
  {
    version: 1,
    id: 'paper',
    name: 'Paper',
    description: 'Warm editorial neutrals with subtle sepia accents.',
    fonts: {
      sans: 'Geist',
      code: 'SF Mono'
    },
    source: 'built-in',
    tokens: {
      light: {
        background: '#f6f0e7',
        foreground: '#2f241e',
        accent: '#b56c52',
        accentForeground: '#fff7f1',
        card: '#fbf6ef',
        cardForeground: '#2f241e',
        popover: '#fffaf4',
        popoverForeground: '#2f241e',
        primary: '#2f241e',
        primaryForeground: '#fff8f2',
        secondary: '#ebe2d6',
        secondaryForeground: '#3c2f28',
        muted: '#eee5d9',
        mutedForeground: '#7a665c',
        destructive: '#b33a2e',
        border: 'rgba(88, 63, 43, 0.14)',
        input: 'rgba(88, 63, 43, 0.16)',
        ring: 'rgba(181, 108, 82, 0.34)',
        sidebar: 'rgba(247, 238, 226, 0.86)',
        sidebarForeground: '#2f241e',
        sidebarPrimary: '#2f241e',
        sidebarPrimaryForeground: '#fff8f2',
        sidebarAccent: 'rgba(255, 250, 244, 0.75)',
        sidebarAccentForeground: '#2f241e',
        sidebarBorder: 'rgba(88, 63, 43, 0.12)',
        sidebarRing: 'rgba(181, 108, 82, 0.28)',
        sidebarMuted: '#8e776a',
        sidebarHover: 'rgba(88, 63, 43, 0.06)',
        sidebarActive: 'rgba(88, 63, 43, 0.1)',
        sidebarTint: 'rgba(255, 255, 255, 0.36)',
        sidebarGlow: 'rgba(255, 245, 233, 0.24)',
        terminalBg: '#efe5d9'
      },
      dark: {
        background: '#18110d',
        foreground: '#f2e7db',
        accent: '#ef9f7f',
        accentForeground: '#2a140d',
        card: '#1e1611',
        cardForeground: '#f2e7db',
        popover: '#201711',
        popoverForeground: '#f2e7db',
        primary: '#f2e7db',
        primaryForeground: '#24130d',
        secondary: '#241a15',
        secondaryForeground: '#f2e7db',
        muted: '#241a15',
        mutedForeground: '#af9a8c',
        destructive: '#ee6d5f',
        border: 'rgba(255, 238, 224, 0.1)',
        input: 'rgba(255, 238, 224, 0.1)',
        ring: 'rgba(239, 159, 127, 0.3)',
        sidebar: 'rgba(28, 21, 16, 0.88)',
        sidebarForeground: '#f4e9dc',
        sidebarPrimary: '#f2e7db',
        sidebarPrimaryForeground: '#24130d',
        sidebarAccent: 'rgba(255, 243, 230, 0.06)',
        sidebarAccentForeground: '#f2e7db',
        sidebarBorder: 'rgba(255, 238, 224, 0.08)',
        sidebarRing: 'rgba(239, 159, 127, 0.26)',
        sidebarMuted: '#aa9484',
        sidebarHover: 'rgba(255, 243, 230, 0.04)',
        sidebarActive: 'rgba(255, 243, 230, 0.08)',
        sidebarTint: 'rgba(8, 5, 4, 0.24)',
        sidebarGlow: 'rgba(239, 159, 127, 0.08)',
        terminalBg: '#1a120e'
      }
    }
  },
  {
    version: 1,
    id: 'nord',
    name: 'Nord',
    description: 'Cool fjord blues with high-clarity contrast.',
    fonts: {
      sans: 'System',
      code: 'Geist Mono'
    },
    source: 'built-in',
    tokens: {
      light: {
        background: '#edf2f7',
        foreground: '#243447',
        accent: '#5e81ac',
        accentForeground: '#f4f8fb',
        card: '#f8fbfd',
        cardForeground: '#243447',
        popover: '#fbfdff',
        popoverForeground: '#243447',
        primary: '#243447',
        primaryForeground: '#f6fbff',
        secondary: '#dfe7ef',
        secondaryForeground: '#243447',
        muted: '#e5ebf2',
        mutedForeground: '#61758a',
        destructive: '#bf616a',
        border: 'rgba(36, 52, 71, 0.1)',
        input: 'rgba(36, 52, 71, 0.12)',
        ring: 'rgba(94, 129, 172, 0.32)',
        sidebar: 'rgba(235, 241, 247, 0.8)',
        sidebarForeground: '#243447',
        sidebarPrimary: '#243447',
        sidebarPrimaryForeground: '#f6fbff',
        sidebarAccent: 'rgba(255, 255, 255, 0.5)',
        sidebarAccentForeground: '#243447',
        sidebarBorder: 'rgba(36, 52, 71, 0.1)',
        sidebarRing: 'rgba(94, 129, 172, 0.28)',
        sidebarMuted: '#708395',
        sidebarHover: 'rgba(36, 52, 71, 0.05)',
        sidebarActive: 'rgba(36, 52, 71, 0.08)',
        sidebarTint: 'rgba(255, 255, 255, 0.28)',
        sidebarGlow: 'rgba(191, 219, 254, 0.18)',
        terminalBg: '#e5edf5'
      },
      dark: {
        background: '#0f1722',
        foreground: '#e5edf5',
        accent: '#88c0d0',
        accentForeground: '#0d1822',
        card: '#121d2a',
        cardForeground: '#e5edf5',
        popover: '#14202d',
        popoverForeground: '#e5edf5',
        primary: '#dbe7f3',
        primaryForeground: '#0f1722',
        secondary: '#162332',
        secondaryForeground: '#e5edf5',
        muted: '#162332',
        mutedForeground: '#93a4b6',
        destructive: '#bf616a',
        border: 'rgba(216, 227, 240, 0.1)',
        input: 'rgba(216, 227, 240, 0.1)',
        ring: 'rgba(136, 192, 208, 0.32)',
        sidebar: 'rgba(17, 26, 37, 0.9)',
        sidebarForeground: '#e6eef7',
        sidebarPrimary: '#dbe7f3',
        sidebarPrimaryForeground: '#0f1722',
        sidebarAccent: 'rgba(255, 255, 255, 0.06)',
        sidebarAccentForeground: '#e5edf5',
        sidebarBorder: 'rgba(216, 227, 240, 0.08)',
        sidebarRing: 'rgba(136, 192, 208, 0.26)',
        sidebarMuted: '#8ea1b3',
        sidebarHover: 'rgba(255, 255, 255, 0.04)',
        sidebarActive: 'rgba(255, 255, 255, 0.08)',
        sidebarTint: 'rgba(7, 12, 19, 0.3)',
        sidebarGlow: 'rgba(94, 129, 172, 0.14)',
        terminalBg: '#101926'
      }
    }
  },
  {
    version: 1,
    id: 'ember',
    name: 'Ember',
    description: 'Charcoal surfaces lit by copper and ember highlights.',
    fonts: {
      sans: 'Geist',
      code: 'Monaco'
    },
    source: 'built-in',
    tokens: {
      light: {
        background: '#fff4ec',
        foreground: '#2d1812',
        accent: '#d96b2b',
        accentForeground: '#fff7f1',
        card: '#fff9f4',
        cardForeground: '#2d1812',
        popover: '#fffaf6',
        popoverForeground: '#2d1812',
        primary: '#2d1812',
        primaryForeground: '#fff7f1',
        secondary: '#f7e3d5',
        secondaryForeground: '#371e16',
        muted: '#fae9dc',
        mutedForeground: '#8d6956',
        destructive: '#c43d24',
        border: 'rgba(74, 36, 20, 0.12)',
        input: 'rgba(74, 36, 20, 0.14)',
        ring: 'rgba(217, 107, 43, 0.34)',
        sidebar: 'rgba(255, 241, 229, 0.82)',
        sidebarForeground: '#2d1812',
        sidebarPrimary: '#2d1812',
        sidebarPrimaryForeground: '#fff7f1',
        sidebarAccent: 'rgba(255, 255, 255, 0.5)',
        sidebarAccentForeground: '#2d1812',
        sidebarBorder: 'rgba(74, 36, 20, 0.1)',
        sidebarRing: 'rgba(217, 107, 43, 0.28)',
        sidebarMuted: '#946b57',
        sidebarHover: 'rgba(74, 36, 20, 0.05)',
        sidebarActive: 'rgba(74, 36, 20, 0.09)',
        sidebarTint: 'rgba(255, 255, 255, 0.24)',
        sidebarGlow: 'rgba(255, 215, 180, 0.22)',
        terminalBg: '#f8e5d8'
      },
      dark: {
        background: '#15110f',
        foreground: '#f8e9dd',
        accent: '#ff9a5c',
        accentForeground: '#2d1308',
        card: '#1b1411',
        cardForeground: '#f8e9dd',
        popover: '#211711',
        popoverForeground: '#f8e9dd',
        primary: '#f8e9dd',
        primaryForeground: '#201109',
        secondary: '#251915',
        secondaryForeground: '#f8e9dd',
        muted: '#251915',
        mutedForeground: '#bb9580',
        destructive: '#ff6b4a',
        border: 'rgba(255, 231, 220, 0.1)',
        input: 'rgba(255, 231, 220, 0.1)',
        ring: 'rgba(255, 154, 92, 0.32)',
        sidebar: 'rgba(24, 18, 14, 0.9)',
        sidebarForeground: '#f9ecdf',
        sidebarPrimary: '#f8e9dd',
        sidebarPrimaryForeground: '#201109',
        sidebarAccent: 'rgba(255, 255, 255, 0.05)',
        sidebarAccentForeground: '#f8e9dd',
        sidebarBorder: 'rgba(255, 231, 220, 0.08)',
        sidebarRing: 'rgba(255, 154, 92, 0.26)',
        sidebarMuted: '#bf9d8a',
        sidebarHover: 'rgba(255, 255, 255, 0.04)',
        sidebarActive: 'rgba(255, 255, 255, 0.07)',
        sidebarTint: 'rgba(12, 7, 4, 0.28)',
        sidebarGlow: 'rgba(255, 154, 92, 0.12)',
        terminalBg: '#19120f'
      }
    }
  },
  {
    version: 1,
    id: 'claude',
    name: 'Claude',
    author: 'Anthropic',
    description: 'Warm terracotta and cream inspired by the Claude brand.',
    fonts: {
      sans: 'DM Sans',
      code: 'Geist Mono'
    },
    source: 'built-in',
    tokens: {
      light: {
        background: '#F4F3EE',
        foreground: '#2D2B28',
        accent: '#C15F3C',
        accentForeground: '#FFFFFF',
        card: '#FFFFFF',
        cardForeground: '#2D2B28',
        popover: '#FFFFFF',
        popoverForeground: '#2D2B28',
        primary: '#2D2B28',
        primaryForeground: '#F4F3EE',
        secondary: '#E8E6E0',
        secondaryForeground: '#2D2B28',
        muted: '#E8E6E0',
        mutedForeground: '#8A8680',
        destructive: '#C43D24',
        border: 'rgba(45, 43, 40, 0.10)',
        input: 'rgba(45, 43, 40, 0.12)',
        ring: 'rgba(193, 95, 60, 0.32)',
        sidebar: 'rgba(240, 238, 232, 0.82)',
        sidebarForeground: '#2D2B28',
        sidebarPrimary: '#2D2B28',
        sidebarPrimaryForeground: '#F4F3EE',
        sidebarAccent: 'rgba(255, 255, 255, 0.55)',
        sidebarAccentForeground: '#2D2B28',
        sidebarBorder: 'rgba(45, 43, 40, 0.08)',
        sidebarRing: 'rgba(193, 95, 60, 0.28)',
        sidebarMuted: '#918D86',
        sidebarHover: 'rgba(45, 43, 40, 0.05)',
        sidebarActive: 'rgba(45, 43, 40, 0.09)',
        sidebarTint: 'rgba(255, 255, 255, 0.32)',
        sidebarGlow: 'rgba(244, 243, 238, 0.24)',
        terminalBg: '#EAE8E2'
      },
      dark: {
        background: '#1A1816',
        foreground: '#E8E5DF',
        accent: '#D97B5A',
        accentForeground: '#1A1816',
        card: '#211F1C',
        cardForeground: '#E8E5DF',
        popover: '#231F1C',
        popoverForeground: '#E8E5DF',
        primary: '#E8E5DF',
        primaryForeground: '#1A1816',
        secondary: '#282522',
        secondaryForeground: '#E8E5DF',
        muted: '#282522',
        mutedForeground: '#A9A49C',
        destructive: '#E85D45',
        border: 'rgba(232, 229, 223, 0.09)',
        input: 'rgba(232, 229, 223, 0.09)',
        ring: 'rgba(217, 123, 90, 0.30)',
        sidebar: 'rgba(26, 23, 20, 0.90)',
        sidebarForeground: '#E9E6E0',
        sidebarPrimary: '#E8E5DF',
        sidebarPrimaryForeground: '#1A1816',
        sidebarAccent: 'rgba(232, 229, 223, 0.06)',
        sidebarAccentForeground: '#E8E5DF',
        sidebarBorder: 'rgba(232, 229, 223, 0.07)',
        sidebarRing: 'rgba(217, 123, 90, 0.26)',
        sidebarMuted: '#8A8580',
        sidebarHover: 'rgba(232, 229, 223, 0.04)',
        sidebarActive: 'rgba(232, 229, 223, 0.07)',
        sidebarTint: 'rgba(14, 12, 10, 0.24)',
        sidebarGlow: 'rgba(217, 123, 90, 0.08)',
        terminalBg: '#1C1A17'
      }
    }
  },
  {
    version: 1,
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    author: 'Catppuccin',
    description: 'Catppuccin Latte — a soothing pastel light theme.',
    source: 'built-in',
    tokens: {
      light: {
        background: '#eff1f5',
        foreground: '#4c4f69',
        accent: '#8839ef',
        accentForeground: '#eff1f5',
        card: '#eff1f5',
        cardForeground: '#4c4f69',
        popover: '#e6e9ef',
        popoverForeground: '#4c4f69',
        primary: '#4c4f69',
        primaryForeground: '#eff1f5',
        secondary: '#ccd0da',
        secondaryForeground: '#4c4f69',
        muted: '#e6e9ef',
        mutedForeground: '#8c8fa1',
        destructive: '#d20f39',
        border: 'rgba(76, 79, 105, 0.12)',
        input: 'rgba(76, 79, 105, 0.12)',
        ring: 'rgba(136, 57, 239, 0.3)',
        sidebar: 'rgba(230, 233, 239, 0.82)',
        sidebarForeground: '#4c4f69',
        sidebarPrimary: '#4c4f69',
        sidebarPrimaryForeground: '#eff1f5',
        sidebarAccent: 'rgba(239, 241, 245, 0.6)',
        sidebarAccentForeground: '#4c4f69',
        sidebarBorder: 'rgba(76, 79, 105, 0.1)',
        sidebarRing: 'rgba(136, 57, 239, 0.25)',
        sidebarMuted: '#9ca0b0',
        sidebarHover: 'rgba(76, 79, 105, 0.06)',
        sidebarActive: 'rgba(76, 79, 105, 0.1)',
        sidebarTint: 'rgba(255, 255, 255, 0.3)',
        sidebarGlow: 'rgba(136, 57, 239, 0.08)',
        terminalBg: '#e6e9ef'
      },
      dark: {
        background: '#303446',
        foreground: '#c6d0f5',
        accent: '#ca9ee6',
        accentForeground: '#303446',
        card: '#303446',
        cardForeground: '#c6d0f5',
        popover: '#292c3c',
        popoverForeground: '#c6d0f5',
        primary: '#c6d0f5',
        primaryForeground: '#303446',
        secondary: '#414559',
        secondaryForeground: '#c6d0f5',
        muted: '#414559',
        mutedForeground: '#a5adce',
        destructive: '#e78284',
        border: 'rgba(198, 208, 245, 0.08)',
        input: 'rgba(198, 208, 245, 0.08)',
        ring: 'rgba(202, 158, 230, 0.3)',
        sidebar: 'rgba(41, 44, 60, 0.9)',
        sidebarForeground: '#c6d0f5',
        sidebarPrimary: '#c6d0f5',
        sidebarPrimaryForeground: '#303446',
        sidebarAccent: 'rgba(198, 208, 245, 0.06)',
        sidebarAccentForeground: '#c6d0f5',
        sidebarBorder: 'rgba(198, 208, 245, 0.07)',
        sidebarRing: 'rgba(202, 158, 230, 0.25)',
        sidebarMuted: '#838ba7',
        sidebarHover: 'rgba(198, 208, 245, 0.04)',
        sidebarActive: 'rgba(198, 208, 245, 0.07)',
        sidebarTint: 'rgba(35, 38, 52, 0.24)',
        sidebarGlow: 'rgba(202, 158, 230, 0.06)',
        terminalBg: '#303446'
      }
    }
  },
  {
    version: 1,
    id: 'catppuccin-frappe',
    name: 'Catppuccin Frappé',
    author: 'Catppuccin',
    description: 'Catppuccin Frappé — a muted, cozy dark theme.',
    source: 'built-in',
    tokens: {
      light: {
        background: '#eff1f5',
        foreground: '#4c4f69',
        accent: '#8839ef',
        accentForeground: '#eff1f5',
        card: '#eff1f5',
        cardForeground: '#4c4f69',
        popover: '#e6e9ef',
        popoverForeground: '#4c4f69',
        primary: '#4c4f69',
        primaryForeground: '#eff1f5',
        secondary: '#ccd0da',
        secondaryForeground: '#4c4f69',
        muted: '#e6e9ef',
        mutedForeground: '#8c8fa1',
        destructive: '#d20f39',
        border: 'rgba(76, 79, 105, 0.12)',
        input: 'rgba(76, 79, 105, 0.12)',
        ring: 'rgba(136, 57, 239, 0.3)',
        sidebar: 'rgba(230, 233, 239, 0.82)',
        sidebarForeground: '#4c4f69',
        sidebarPrimary: '#4c4f69',
        sidebarPrimaryForeground: '#eff1f5',
        sidebarAccent: 'rgba(239, 241, 245, 0.6)',
        sidebarAccentForeground: '#4c4f69',
        sidebarBorder: 'rgba(76, 79, 105, 0.1)',
        sidebarRing: 'rgba(136, 57, 239, 0.25)',
        sidebarMuted: '#9ca0b0',
        sidebarHover: 'rgba(76, 79, 105, 0.06)',
        sidebarActive: 'rgba(76, 79, 105, 0.1)',
        sidebarTint: 'rgba(255, 255, 255, 0.3)',
        sidebarGlow: 'rgba(136, 57, 239, 0.08)',
        terminalBg: '#e6e9ef'
      },
      dark: {
        background: '#303446',
        foreground: '#c6d0f5',
        accent: '#ca9ee6',
        accentForeground: '#303446',
        card: '#303446',
        cardForeground: '#c6d0f5',
        popover: '#292c3c',
        popoverForeground: '#c6d0f5',
        primary: '#c6d0f5',
        primaryForeground: '#303446',
        secondary: '#414559',
        secondaryForeground: '#c6d0f5',
        muted: '#414559',
        mutedForeground: '#a5adce',
        destructive: '#e78284',
        border: 'rgba(198, 208, 245, 0.08)',
        input: 'rgba(198, 208, 245, 0.08)',
        ring: 'rgba(202, 158, 230, 0.3)',
        sidebar: 'rgba(41, 44, 60, 0.9)',
        sidebarForeground: '#c6d0f5',
        sidebarPrimary: '#c6d0f5',
        sidebarPrimaryForeground: '#303446',
        sidebarAccent: 'rgba(198, 208, 245, 0.06)',
        sidebarAccentForeground: '#c6d0f5',
        sidebarBorder: 'rgba(198, 208, 245, 0.07)',
        sidebarRing: 'rgba(202, 158, 230, 0.25)',
        sidebarMuted: '#838ba7',
        sidebarHover: 'rgba(198, 208, 245, 0.04)',
        sidebarActive: 'rgba(198, 208, 245, 0.07)',
        sidebarTint: 'rgba(35, 38, 52, 0.24)',
        sidebarGlow: 'rgba(202, 158, 230, 0.06)',
        terminalBg: '#303446'
      }
    }
  },
  {
    version: 1,
    id: 'catppuccin-macchiato',
    name: 'Catppuccin Macchiato',
    author: 'Catppuccin',
    description: 'Catppuccin Macchiato — a rich, mid-darkness dark theme.',
    source: 'built-in',
    tokens: {
      light: {
        background: '#eff1f5',
        foreground: '#4c4f69',
        accent: '#8839ef',
        accentForeground: '#eff1f5',
        card: '#eff1f5',
        cardForeground: '#4c4f69',
        popover: '#e6e9ef',
        popoverForeground: '#4c4f69',
        primary: '#4c4f69',
        primaryForeground: '#eff1f5',
        secondary: '#ccd0da',
        secondaryForeground: '#4c4f69',
        muted: '#e6e9ef',
        mutedForeground: '#8c8fa1',
        destructive: '#d20f39',
        border: 'rgba(76, 79, 105, 0.12)',
        input: 'rgba(76, 79, 105, 0.12)',
        ring: 'rgba(136, 57, 239, 0.3)',
        sidebar: 'rgba(230, 233, 239, 0.82)',
        sidebarForeground: '#4c4f69',
        sidebarPrimary: '#4c4f69',
        sidebarPrimaryForeground: '#eff1f5',
        sidebarAccent: 'rgba(239, 241, 245, 0.6)',
        sidebarAccentForeground: '#4c4f69',
        sidebarBorder: 'rgba(76, 79, 105, 0.1)',
        sidebarRing: 'rgba(136, 57, 239, 0.25)',
        sidebarMuted: '#9ca0b0',
        sidebarHover: 'rgba(76, 79, 105, 0.06)',
        sidebarActive: 'rgba(76, 79, 105, 0.1)',
        sidebarTint: 'rgba(255, 255, 255, 0.3)',
        sidebarGlow: 'rgba(136, 57, 239, 0.08)',
        terminalBg: '#e6e9ef'
      },
      dark: {
        background: '#24273a',
        foreground: '#cad3f5',
        accent: '#c6a0f6',
        accentForeground: '#24273a',
        card: '#24273a',
        cardForeground: '#cad3f5',
        popover: '#1e2030',
        popoverForeground: '#cad3f5',
        primary: '#cad3f5',
        primaryForeground: '#24273a',
        secondary: '#363a4f',
        secondaryForeground: '#cad3f5',
        muted: '#363a4f',
        mutedForeground: '#a5adcb',
        destructive: '#ed8796',
        border: 'rgba(202, 211, 245, 0.08)',
        input: 'rgba(202, 211, 245, 0.08)',
        ring: 'rgba(198, 160, 246, 0.3)',
        sidebar: 'rgba(30, 32, 48, 0.9)',
        sidebarForeground: '#cad3f5',
        sidebarPrimary: '#cad3f5',
        sidebarPrimaryForeground: '#24273a',
        sidebarAccent: 'rgba(202, 211, 245, 0.06)',
        sidebarAccentForeground: '#cad3f5',
        sidebarBorder: 'rgba(202, 211, 245, 0.07)',
        sidebarRing: 'rgba(198, 160, 246, 0.25)',
        sidebarMuted: '#8087a2',
        sidebarHover: 'rgba(202, 211, 245, 0.04)',
        sidebarActive: 'rgba(202, 211, 245, 0.07)',
        sidebarTint: 'rgba(24, 25, 38, 0.24)',
        sidebarGlow: 'rgba(198, 160, 246, 0.06)',
        terminalBg: '#24273a'
      }
    }
  },
  {
    version: 1,
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    author: 'Catppuccin',
    description: 'Catppuccin Mocha — the darkest, most popular Catppuccin flavor.',
    source: 'built-in',
    tokens: {
      light: {
        background: '#eff1f5',
        foreground: '#4c4f69',
        accent: '#8839ef',
        accentForeground: '#eff1f5',
        card: '#eff1f5',
        cardForeground: '#4c4f69',
        popover: '#e6e9ef',
        popoverForeground: '#4c4f69',
        primary: '#4c4f69',
        primaryForeground: '#eff1f5',
        secondary: '#ccd0da',
        secondaryForeground: '#4c4f69',
        muted: '#e6e9ef',
        mutedForeground: '#8c8fa1',
        destructive: '#d20f39',
        border: 'rgba(76, 79, 105, 0.12)',
        input: 'rgba(76, 79, 105, 0.12)',
        ring: 'rgba(136, 57, 239, 0.3)',
        sidebar: 'rgba(230, 233, 239, 0.82)',
        sidebarForeground: '#4c4f69',
        sidebarPrimary: '#4c4f69',
        sidebarPrimaryForeground: '#eff1f5',
        sidebarAccent: 'rgba(239, 241, 245, 0.6)',
        sidebarAccentForeground: '#4c4f69',
        sidebarBorder: 'rgba(76, 79, 105, 0.1)',
        sidebarRing: 'rgba(136, 57, 239, 0.25)',
        sidebarMuted: '#9ca0b0',
        sidebarHover: 'rgba(76, 79, 105, 0.06)',
        sidebarActive: 'rgba(76, 79, 105, 0.1)',
        sidebarTint: 'rgba(255, 255, 255, 0.3)',
        sidebarGlow: 'rgba(136, 57, 239, 0.08)',
        terminalBg: '#e6e9ef'
      },
      dark: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        accent: '#cba6f7',
        accentForeground: '#1e1e2e',
        card: '#1e1e2e',
        cardForeground: '#cdd6f4',
        popover: '#181825',
        popoverForeground: '#cdd6f4',
        primary: '#cdd6f4',
        primaryForeground: '#1e1e2e',
        secondary: '#313244',
        secondaryForeground: '#cdd6f4',
        muted: '#313244',
        mutedForeground: '#a6adc8',
        destructive: '#f38ba8',
        border: 'rgba(205, 214, 244, 0.08)',
        input: 'rgba(205, 214, 244, 0.08)',
        ring: 'rgba(203, 166, 247, 0.3)',
        sidebar: 'rgba(24, 24, 37, 0.9)',
        sidebarForeground: '#cdd6f4',
        sidebarPrimary: '#cdd6f4',
        sidebarPrimaryForeground: '#1e1e2e',
        sidebarAccent: 'rgba(205, 214, 244, 0.06)',
        sidebarAccentForeground: '#cdd6f4',
        sidebarBorder: 'rgba(205, 214, 244, 0.07)',
        sidebarRing: 'rgba(203, 166, 247, 0.25)',
        sidebarMuted: '#7f849c',
        sidebarHover: 'rgba(205, 214, 244, 0.04)',
        sidebarActive: 'rgba(205, 214, 244, 0.07)',
        sidebarTint: 'rgba(17, 17, 27, 0.24)',
        sidebarGlow: 'rgba(203, 166, 247, 0.06)',
        terminalBg: '#1e1e2e'
      }
    }
  }
]

export const DEFAULT_THEME_ID = 'ross'
export const BUILT_IN_THEME_IDS = new Set(BUILT_IN_THEMES.map((theme) => theme.id))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeThemeFonts(value: unknown): ThemeFonts | undefined {
  if (value == null) return undefined
  if (!isRecord(value)) {
    throw new Error('Theme fonts must be an object when provided.')
  }

  const sans = readOptionalString(value.sans)
  const code = readOptionalString(value.code)

  if (!sans && !code) {
    throw new Error('Theme fonts must include at least one non-empty "sans" or "code" value.')
  }

  return {
    ...(sans ? { sans } : {}),
    ...(code ? { code } : {})
  }
}

export function sanitizeThemeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function normalizeThemeTokens(value: unknown, mode: ThemeMode): ThemeValidationResult {
  if (!isRecord(value)) {
    return { ok: false, error: `Theme "${mode}" tokens must be an object.` }
  }

  const tokens = {} as ThemeTokens
  for (const key of THEME_TOKEN_KEYS) {
    const tokenValue = value[key]
    if (typeof tokenValue !== 'string' || tokenValue.trim().length === 0) {
      return { ok: false, error: `Theme "${mode}" token "${key}" must be a non-empty string.` }
    }
    tokens[key] = tokenValue.trim()
  }

  return {
    ok: true,
    theme: {
      version: 1,
      id: 'validated',
      name: 'validated',
      tokens: {
        light: tokens,
        dark: tokens
      }
    }
  }
}

export function validateThemeDefinition(value: unknown): ThemeValidationResult {
  if (!isRecord(value)) {
    return { ok: false, error: 'Theme file must contain a JSON object.' }
  }

  if (value.version !== 1) {
    return { ok: false, error: 'Theme version must be 1.' }
  }

  const rawId = readOptionalString(value.id)
  const id = rawId ? sanitizeThemeId(rawId) : ''
  if (!id) {
    return { ok: false, error: 'Theme id is required and must contain letters or numbers.' }
  }

  const name = readOptionalString(value.name)
  if (!name) {
    return { ok: false, error: 'Theme name is required.' }
  }

  let fonts: ThemeFonts | undefined
  try {
    fonts = normalizeThemeFonts(value.fonts)
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Theme fonts are invalid.'
    }
  }

  const tokens = isRecord(value.tokens) ? value.tokens : null
  if (!tokens) {
    return { ok: false, error: 'Theme tokens must be an object with light and dark palettes.' }
  }

  const lightResult = normalizeThemeTokens(tokens.light, 'light')
  if (!lightResult.ok) return lightResult

  const darkResult = normalizeThemeTokens(tokens.dark, 'dark')
  if (!darkResult.ok) return darkResult

  return {
    ok: true,
    theme: {
      version: 1,
      id,
      name,
      author: readOptionalString(value.author),
      description: readOptionalString(value.description),
      fonts,
      tokens: {
        light: lightResult.theme.tokens.light,
        dark: darkResult.theme.tokens.dark
      }
    }
  }
}

export function createThemeCatalogEntry(
  theme: ThemeDefinition,
  source: ThemeSource
): ThemeCatalogEntry {
  return {
    ...theme,
    source
  }
}

export function getBuiltInThemeById(themeId: string): ThemeCatalogEntry | undefined {
  return BUILT_IN_THEMES.find((theme) => theme.id === themeId)
}

export function getThemeFontOverrides(theme: ThemeDefinition | ThemeCatalogEntry | undefined): {
  sansFontFamily?: string
  codeFontFamily?: string
} {
  if (!theme?.fonts) return {}

  return {
    ...(theme.fonts.sans ? { sansFontFamily: theme.fonts.sans } : {}),
    ...(theme.fonts.code ? { codeFontFamily: theme.fonts.code } : {})
  }
}
