import { useEffect, useState } from 'react'

export interface FontFamily {
  name: string
  /** True if any face in the family has a monospace-like fullName / style hint */
  mono: boolean
}

interface LocalFontData {
  family: string
}

interface QueryLocalFontsWindow extends Window {
  queryLocalFonts?: () => Promise<LocalFontData[]>
}

let cachedFonts: FontFamily[] | null = null

async function loadSystemFonts(): Promise<FontFamily[]> {
  if (cachedFonts) return cachedFonts

  const fontsWindow = window as QueryLocalFontsWindow
  if (!fontsWindow.queryLocalFonts) return []

  try {
    const fonts = await fontsWindow.queryLocalFonts()
    const familyMap = new Map<string, boolean>()

    for (const font of fonts) {
      const family: string = font.family
      // Skip hidden/internal fonts
      if (family.startsWith('.')) continue

      if (!familyMap.has(family)) {
        familyMap.set(family, false)
      }

      // Heuristic: mark as mono if the family name contains mono-related keywords
      const lower = family.toLowerCase()
      if (
        lower.includes('mono') ||
        lower.includes('courier') ||
        lower.includes('consolas') ||
        lower.includes('menlo') ||
        lower.includes('code') ||
        lower.includes('terminal') ||
        lower.includes('fixed')
      ) {
        familyMap.set(family, true)
      }
    }

    cachedFonts = Array.from(familyMap.entries())
      .map(([name, mono]) => ({ name, mono }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return cachedFonts
  } catch {
    return []
  }
}

export function useSystemFonts(): FontFamily[] {
  const [fonts, setFonts] = useState<FontFamily[]>(cachedFonts ?? [])

  useEffect(() => {
    loadSystemFonts().then(setFonts)
  }, [])

  return fonts
}
