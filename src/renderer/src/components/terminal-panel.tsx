import { memo, useRef, useEffect, useCallback, useState, type ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, TerminalSquare } from 'lucide-react'
import { useCodexStore } from '@/lib/store'
import type { Ghostty } from 'ghostty-web'
import ghosttyWasmUrl from 'ghostty-web/ghostty-vt.wasm?url'

interface TerminalTab {
  id: string
  title: string
}

interface GhosttyTerminal {
  open: (el: HTMLElement) => void
  dispose: () => void
  write: (data: string) => void
  focus: () => void
  onData: (cb: (data: string) => void) => void
  onResize: (cb: (size: { cols: number; rows: number }) => void) => void
  loadAddon: (addon: unknown) => void
  cols: number
  rows: number
}

interface GhosttyRuntime {
  load: (wasmPath?: string) => Promise<Ghostty>
}

interface GhosttyFitAddon {
  fit: () => void
  observeResize: () => void
  proposeDimensions?: () => { cols: number; rows: number } | undefined
}

function getPreferredTerminalFontFamily(preferredFamily?: string): string {
  const configuredFamily =
    preferredFamily ||
    getComputedStyle(document.documentElement).getPropertyValue('--app-code-font-family').trim()
  const fallbackGlyphs = [
    "'Symbols Nerd Font Mono'",
    "'Symbols Nerd Font'",
    "'MesloLGS NF'",
    "'JetBrainsMono Nerd Font'",
    "'Hack Nerd Font'",
    "'PowerlineSymbols'"
  ].join(', ')

  if (!configuredFamily) {
    return `${fallbackGlyphs}, 'SF Mono', Menlo, Monaco, ui-monospace, monospace`
  }

  return `${configuredFamily}, ${fallbackGlyphs}`
}

function getCssColor(variableName: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim()
  return value || fallback
}

function withAlpha(color: string, alpha: number): string {
  const normalized = color.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return color

  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function buildTerminalTheme(
  appearance: Awaited<ReturnType<typeof window.codex.readGhosttyAppearance>>,
  background: string,
  foreground: string,
  preferDark: boolean
): Record<string, string> {
  return {
    background: appearance?.background || background,
    foreground: appearance?.foreground || foreground,
    cursor: appearance?.cursor || appearance?.foreground || foreground,
    cursorAccent: appearance?.cursorAccent || appearance?.background || background,
    selectionBackground: appearance?.selectionBackground || '#353749',
    selectionForeground: appearance?.selectionForeground || appearance?.foreground || foreground,
    black: appearance?.black || '#1a1a1a',
    red: appearance?.red || (preferDark ? '#f87171' : '#dc2626'),
    green: appearance?.green || (preferDark ? '#4ade80' : '#16a34a'),
    yellow: appearance?.yellow || (preferDark ? '#facc15' : '#ca8a04'),
    blue: appearance?.blue || (preferDark ? '#60a5fa' : '#2563eb'),
    magenta: appearance?.magenta || (preferDark ? '#c084fc' : '#9333ea'),
    cyan: appearance?.cyan || (preferDark ? '#22d3ee' : '#0891b2'),
    white: appearance?.white || '#e5e5e5',
    brightBlack: appearance?.brightBlack || (preferDark ? '#525252' : '#737373'),
    brightRed: appearance?.brightRed || (preferDark ? '#fca5a5' : '#ef4444'),
    brightGreen: appearance?.brightGreen || (preferDark ? '#86efac' : '#22c55e'),
    brightYellow: appearance?.brightYellow || (preferDark ? '#fde68a' : '#eab308'),
    brightBlue: appearance?.brightBlue || (preferDark ? '#93c5fd' : '#3b82f6'),
    brightMagenta: appearance?.brightMagenta || (preferDark ? '#d8b4fe' : '#a855f7'),
    brightCyan: appearance?.brightCyan || (preferDark ? '#67e8f9' : '#06b6d4'),
    brightWhite: appearance?.brightWhite || (preferDark ? '#f5f5f5' : '#fafafa')
  }
}

function TerminalPanel(): ReactElement | null {
  const { settings, updateSettings, activeProject } = useCodexStore()
  const { isTerminalOpen, terminalWidth, codeFontSize } = settings

  const containerRef = useRef<HTMLDivElement>(null)
  const terminalElRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<GhosttyTerminal | null>(null)
  const fitAddonRef = useRef<GhosttyFitAddon | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const initRef = useRef(false)
  const cleanupDataRef = useRef<(() => void) | null>(null)
  const cleanupExitRef = useRef<(() => void) | null>(null)

  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [animationDone, setAnimationDone] = useState(false)
  const [panelBackground, setPanelBackground] = useState<string | null>(null)
  const [terminalPadding, setTerminalPadding] = useState({ x: 4, y: 4 })
  const [chromeColors, setChromeColors] = useState({
    headerBackground: '',
    headerBorder: '',
    activeTabBackground: '',
    activeTabForeground: '',
    inactiveTabForeground: '',
    controlForeground: ''
  })

  const isResizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isResizing.current = true
      startX.current = e.clientX
      startWidth.current = terminalWidth

      const onMove = (ev: MouseEvent): void => {
        if (!isResizing.current) return
        const delta = startX.current - ev.clientX
        const newWidth = Math.max(300, Math.min(800, startWidth.current + delta))
        updateSettings({ terminalWidth: newWidth })
      }

      const onUp = (): void => {
        isResizing.current = false
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        fitAddonRef.current?.fit()
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [terminalWidth, updateSettings]
  )

  const destroyTerminal = useCallback(async () => {
    cleanupDataRef.current?.()
    cleanupDataRef.current = null
    cleanupExitRef.current?.()
    cleanupExitRef.current = null

    if (ptyIdRef.current) {
      try {
        await window.codex.terminalDestroy({ id: ptyIdRef.current })
      } catch {
        // ignore
      }
      ptyIdRef.current = null
    }

    termRef.current?.dispose()
    termRef.current = null
    fitAddonRef.current = null
    initRef.current = false
    setAnimationDone(false)
    setPanelBackground(null)
    setTerminalPadding({ x: 4, y: 4 })
    setChromeColors({
      headerBackground: '',
      headerBorder: '',
      activeTabBackground: '',
      activeTabForeground: '',
      inactiveTabForeground: '',
      controlForeground: ''
    })
    setTabs([])
    setActiveTabId(null)
  }, [])

  // Only create terminal AFTER the open animation finishes so the container has real dimensions
  useEffect(() => {
    if (!animationDone || !isTerminalOpen || initRef.current || !terminalElRef.current) return
    initRef.current = true

    let cancelled = false

    ;(async () => {
      try {
        const ghosttyWeb = await import('ghostty-web')
        const ghostty = await (ghosttyWeb.Ghostty as GhosttyRuntime).load(ghosttyWasmUrl)
        if (cancelled) return

        const ghosttyAppearance = await window.codex.readGhosttyAppearance().catch(() => null)
        if (cancelled) return

        const isDark =
          document.documentElement.classList.contains('dark') ||
          (!document.documentElement.classList.contains('light') &&
            window.matchMedia('(prefers-color-scheme: dark)').matches)
        const terminalBackground = getCssColor('--terminal-bg', isDark ? '#181818' : '#f5f5f5')
        const terminalForeground = getCssColor('--foreground', isDark ? '#e5e5e5' : '#1a1a1a')
        const terminalTheme = buildTerminalTheme(
          ghosttyAppearance,
          terminalBackground,
          terminalForeground,
          isDark
        )
        const fontFamily = getPreferredTerminalFontFamily(ghosttyAppearance?.fontFamily)
        const fontSize = codeFontSize
        const scrollback = ghosttyAppearance?.scrollbackLimit ?? 10000
        const paddingX = Math.max(0, Math.round(ghosttyAppearance?.windowPaddingX ?? 4))
        const paddingY = Math.max(0, Math.round(ghosttyAppearance?.windowPaddingY ?? 4))

        setPanelBackground(terminalTheme.background)
        setTerminalPadding({ x: paddingX, y: paddingY })
        setChromeColors({
          headerBackground: terminalTheme.background,
          headerBorder:
            ghosttyAppearance?.splitDividerColor || withAlpha(terminalTheme.foreground, 0.12),
          activeTabBackground:
            terminalTheme.selectionBackground || withAlpha(terminalTheme.foreground, 0.14),
          activeTabForeground: terminalTheme.selectionForeground || terminalTheme.foreground,
          inactiveTabForeground: withAlpha(terminalTheme.foreground, 0.72),
          controlForeground: withAlpha(terminalTheme.foreground, 0.62)
        })

        const term = new ghosttyWeb.Terminal({
          cursorBlink: true,
          fontSize,
          fontFamily,
          scrollback,
          theme: terminalTheme,
          ghostty
        }) as unknown as GhosttyTerminal

        if (cancelled) return

        const fitAddon = new ghosttyWeb.FitAddon() as unknown as GhosttyFitAddon
        term.loadAddon(fitAddon)

        term.open(terminalElRef.current!)
        fitAddon.fit()
        fitAddon.observeResize()

        termRef.current = term
        fitAddonRef.current = fitAddon

        const fittedSize = fitAddon.proposeDimensions?.() || { cols: term.cols, rows: term.rows }

        // Terminal input → PTY
        term.onData((data: string) => {
          if (ptyIdRef.current) {
            window.codex.terminalWrite({ id: ptyIdRef.current, data })
          }
        })

        // Terminal resize → PTY
        term.onResize((size: { cols: number; rows: number }) => {
          if (ptyIdRef.current) {
            window.codex.terminalResize({ id: ptyIdRef.current, ...size })
          }
        })

        // PTY output → Terminal
        let ptyId = ''

        cleanupDataRef.current = window.codex.onTerminalData((msg) => {
          if (msg.id === ptyId) {
            termRef.current?.write(msg.data)
          }
        })

        // PTY exit → Close panel
        cleanupExitRef.current = window.codex.onTerminalExit((msg) => {
          if (msg.id === ptyId) {
            setTabs((prev) => prev.filter((t) => t.id !== msg.id))
            updateSettings({ isTerminalOpen: false })
          }
        })

        // Spawn PTY in project directory after listeners are attached so we don't miss the initial prompt
        ptyId = await window.codex.terminalCreate({
          cwd: activeProject?.path,
          cols: fittedSize.cols,
          rows: fittedSize.rows
        })
        if (cancelled) {
          await window.codex.terminalDestroy({ id: ptyId }).catch(() => undefined)
          cleanupDataRef.current?.()
          cleanupDataRef.current = null
          cleanupExitRef.current?.()
          cleanupExitRef.current = null
          return
        }
        ptyIdRef.current = ptyId

        setTabs([{ id: ptyId, title: activeProject?.name || 'Terminal' }])
        setActiveTabId(ptyId)

        // Final fit + focus
        requestAnimationFrame(() => {
          fitAddon.fit()
          if (ptyIdRef.current) {
            window.codex.terminalResize({
              id: ptyIdRef.current,
              cols: term.cols,
              rows: term.rows
            })
          }
          term.focus()
        })
      } catch (err) {
        console.error('[TerminalPanel] Failed to initialize:', err)
        initRef.current = false
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    animationDone,
    isTerminalOpen,
    activeProject?.path,
    activeProject?.name,
    codeFontSize,
    updateSettings
  ])

  // Tear down when panel closes
  useEffect(() => {
    if (!isTerminalOpen && initRef.current) {
      destroyTerminal()
    }
  }, [isTerminalOpen, destroyTerminal])

  // Re-fit when panel width changes
  useEffect(() => {
    if (fitAddonRef.current && isTerminalOpen) {
      requestAnimationFrame(() => fitAddonRef.current?.fit())
    }
  }, [terminalWidth, isTerminalOpen])

  const handleClose = useCallback(() => {
    updateSettings({ isTerminalOpen: false })
  }, [updateSettings])

  return (
    <AnimatePresence>
      {isTerminalOpen && (
        <motion.div
          ref={containerRef}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: terminalWidth, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          onAnimationComplete={() => setAnimationDone(true)}
          className="relative flex flex-col border-l border-border bg-terminal-bg shrink-0 overflow-hidden h-full"
          style={{ minWidth: 0, backgroundColor: panelBackground || undefined }}
        >
          {/* Resize handle (left edge) */}
          <div
            onMouseDown={handleResizeStart}
            className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-accent/50 transition-colors"
          />

          {/* Tab bar */}
          <div
            className="flex items-center h-11 px-2 gap-1 border-b shrink-0"
            style={{
              backgroundColor: chromeColors.headerBackground || panelBackground || undefined,
              borderColor: chromeColors.headerBorder || undefined
            }}
          >
            <TerminalSquare
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: chromeColors.controlForeground || undefined }}
            />

            <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-hide">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded text-ui-11 transition-colors shrink-0"
                  style={
                    activeTabId === tab.id
                      ? {
                          backgroundColor: chromeColors.activeTabBackground || undefined,
                          color: chromeColors.activeTabForeground || undefined
                        }
                      : {
                          color: chromeColors.inactiveTabForeground || undefined
                        }
                  }
                >
                  {tab.title}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={() => {
                  /* TODO: multi-tab support */
                }}
                className="p-0.5 rounded transition-colors"
                style={{ color: chromeColors.controlForeground || undefined }}
                title="New terminal"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleClose}
                className="p-0.5 rounded transition-colors"
                style={{ color: chromeColors.controlForeground || undefined }}
                title="Close terminal"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Terminal viewport — needs explicit dimensions for the canvas */}
          <div
            ref={terminalElRef}
            className="flex-1 min-h-0 overflow-hidden"
            style={{ padding: `${terminalPadding.y}px ${terminalPadding.x}px` }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default memo(TerminalPanel)
