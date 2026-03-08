import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from 'react'

interface UseResizableSidebarOptions {
  width: number
  minWidth: number
  maxWidth: number
  onWidthChange: (width: number) => void
}

interface UseResizableSidebarResult {
  containerRef: RefObject<HTMLDivElement | null>
  isResizing: boolean
  handlePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
}

function clampWidth(value: number, minWidth: number, maxWidth: number): number {
  return Math.min(maxWidth, Math.max(minWidth, value))
}

export function useResizableSidebar({
  width,
  minWidth,
  maxWidth,
  onWidthChange
}: UseResizableSidebarOptions): UseResizableSidebarResult {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isResizing, setIsResizing] = useState(false)
  const latestWidthRef = useRef(width)
  const latestChangeRef = useRef(onWidthChange)

  useEffect(() => {
    latestWidthRef.current = width
  }, [width])

  useEffect(() => {
    latestChangeRef.current = onWidthChange
  }, [onWidthChange])

  useEffect(() => {
    if (!isResizing) return

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (event: PointerEvent): void => {
      const left = containerRef.current?.getBoundingClientRect().left ?? 0
      const nextWidth = clampWidth(event.clientX - left, minWidth, maxWidth)

      if (nextWidth !== latestWidthRef.current) {
        latestChangeRef.current(nextWidth)
      }
    }

    const stopResizing = (): void => {
      setIsResizing(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResizing)
    window.addEventListener('pointercancel', stopResizing)

    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResizing)
      window.removeEventListener('pointercancel', stopResizing)
    }
  }, [isResizing, maxWidth, minWidth])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.stopPropagation()

    setIsResizing(true)
  }

  return {
    containerRef,
    isResizing,
    handlePointerDown
  }
}
