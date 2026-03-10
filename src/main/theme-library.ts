import { app, dialog, type BrowserWindow } from 'electron'
import { join } from 'path'
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import {
  BUILT_IN_THEME_IDS,
  BUILT_IN_THEMES,
  createThemeCatalogEntry,
  sanitizeThemeId,
  validateThemeDefinition,
  type ThemeCatalogEntry,
  type ThemeDefinition
} from '../shared/theme'

function getThemesDirectory(): string {
  return join(app.getPath('userData'), 'themes')
}

async function ensureThemesDirectory(): Promise<string> {
  const directory = getThemesDirectory()
  await mkdir(directory, { recursive: true })
  return directory
}

function sortImportedThemes(themes: ThemeCatalogEntry[]): ThemeCatalogEntry[] {
  return [...themes].sort((left, right) => left.name.localeCompare(right.name))
}

function buildThemeCatalog(importedThemes: ThemeCatalogEntry[]): ThemeCatalogEntry[] {
  return [...BUILT_IN_THEMES, ...sortImportedThemes(importedThemes)]
}

async function listImportedThemes(): Promise<ThemeCatalogEntry[]> {
  const directory = await ensureThemesDirectory()
  const entries = await readdir(directory, { withFileTypes: true })
  const importedThemes: ThemeCatalogEntry[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue

    const filePath = join(directory, entry.name)

    try {
      const raw = await readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      const validation = validateThemeDefinition(parsed)

      if (!validation.ok) {
        console.error(`Skipping invalid imported theme "${entry.name}": ${validation.error}`)
        continue
      }

      importedThemes.push(createThemeCatalogEntry(validation.theme, 'imported'))
    } catch (error) {
      console.error(`Failed to load imported theme "${entry.name}":`, error)
    }
  }

  return sortImportedThemes(importedThemes)
}

function resolveUniqueImportedThemeId(themeId: string, importedThemeIds: Set<string>): string {
  const baseId = sanitizeThemeId(themeId)
  if (!importedThemeIds.has(baseId)) return baseId

  let suffix = 2
  while (importedThemeIds.has(`${baseId}-${suffix}`)) {
    suffix += 1
  }

  return `${baseId}-${suffix}`
}

function serializeThemeDefinition(theme: ThemeDefinition): string {
  return `${JSON.stringify(theme, null, 2)}\n`
}

export async function listThemeCatalog(): Promise<{ themes: ThemeCatalogEntry[] }> {
  const importedThemes = await listImportedThemes()
  return { themes: buildThemeCatalog(importedThemes) }
}

export async function importTheme(
  win: BrowserWindow
): Promise<{ imported: ThemeCatalogEntry; themes: ThemeCatalogEntry[] } | null> {
  const result = await dialog.showOpenDialog(win, {
    title: 'Import Theme',
    properties: ['openFile'],
    filters: [
      { name: 'Theme JSON', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const selectedFilePath = result.filePaths[0]
  let parsedTheme: unknown

  try {
    const raw = await readFile(selectedFilePath, 'utf8')
    parsedTheme = JSON.parse(raw) as unknown
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Theme file is not valid JSON.')
    }
    throw error
  }

  const validation = validateThemeDefinition(parsedTheme)
  if (!validation.ok) {
    throw new Error(validation.error)
  }

  if (BUILT_IN_THEME_IDS.has(validation.theme.id)) {
    throw new Error(`Theme id "${validation.theme.id}" is reserved for a built-in theme.`)
  }

  const importedThemes = await listImportedThemes()
  const importedThemeIds = new Set(importedThemes.map((theme) => theme.id))
  const uniqueThemeId = resolveUniqueImportedThemeId(validation.theme.id, importedThemeIds)
  const themeToWrite =
    uniqueThemeId === validation.theme.id
      ? validation.theme
      : {
          ...validation.theme,
          id: uniqueThemeId
        }

  const directory = await ensureThemesDirectory()
  const destinationPath = join(directory, `${themeToWrite.id}.json`)
  await writeFile(destinationPath, serializeThemeDefinition(themeToWrite), 'utf8')

  const imported = createThemeCatalogEntry(themeToWrite, 'imported')
  return {
    imported,
    themes: buildThemeCatalog([...importedThemes, imported])
  }
}

export async function deleteTheme(themeId: string): Promise<{ themes: ThemeCatalogEntry[] }> {
  if (BUILT_IN_THEME_IDS.has(themeId)) {
    throw new Error('Built-in themes cannot be deleted.')
  }

  const safeThemeId = sanitizeThemeId(themeId)
  if (!safeThemeId) {
    throw new Error('Invalid theme id.')
  }

  await rm(join(await ensureThemesDirectory(), `${safeThemeId}.json`), { force: true })
  return listThemeCatalog()
}
