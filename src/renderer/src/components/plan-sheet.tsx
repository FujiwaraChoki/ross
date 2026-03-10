import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import MarkdownRenderer from '@/components/markdown-renderer'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { useCodexStore } from '@/lib/store'

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(timestamp)
}

export default function PlanSheet(): ReactElement {
  const { isPlanSheetOpen, selectedPlanPath, setPlanSheetOpen, setSelectedPlanPath } =
    useCodexStore()
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof window.codex.listPlans>>['plans']>(
    []
  )
  const [activePlan, setActivePlan] = useState<Awaited<
    ReturnType<typeof window.codex.readPlan>
  > | null>(null)
  const [loading, setLoading] = useState(false)

  const loadPlans = useCallback(async (): Promise<void> => {
    try {
      const result = await window.codex.listPlans()
      setPlans(result.plans)

      if (result.plans.length === 0) {
        setActivePlan(null)
        if (selectedPlanPath) setSelectedPlanPath(null)
        return
      }

      const validPath = result.plans.some((p) => p.path === selectedPlanPath)
        ? selectedPlanPath
        : result.plans[0].path

      if (validPath !== selectedPlanPath) setSelectedPlanPath(validPath)
    } catch (err) {
      console.error('Failed to load plans:', err)
    }
  }, [selectedPlanPath, setSelectedPlanPath])

  useEffect(() => {
    if (!isPlanSheetOpen) return
    void loadPlans()
  }, [isPlanSheetOpen, loadPlans])

  useEffect(() => {
    if (!isPlanSheetOpen || !selectedPlanPath) return

    let cancelled = false
    setLoading(true)

    void window.codex
      .readPlan(selectedPlanPath)
      .then((plan) => {
        if (!cancelled) setActivePlan(plan)
      })
      .catch((err) => {
        console.error('Failed to read plan:', err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isPlanSheetOpen, selectedPlanPath])

  const currentIndex = plans.findIndex((p) => p.path === selectedPlanPath)
  const currentPlanMeta = currentIndex >= 0 ? plans[currentIndex] : null
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < plans.length - 1

  return (
    <Sheet open={isPlanSheetOpen} onOpenChange={setPlanSheetOpen}>
      <SheetContent
        side="right"
        className="w-[min(92vw,640px)] max-w-none overflow-hidden border-l border-border/50 bg-background p-0"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="shrink-0 border-b border-border/50 px-5 py-4 pr-12">
            <SheetTitle className="text-ui-sm font-medium">
              {currentPlanMeta?.title || 'Plan'}
            </SheetTitle>
            <SheetDescription className="text-ui-xs text-muted-foreground">
              {currentPlanMeta ? formatDate(currentPlanMeta.updatedAt) : 'No plan to display.'}
            </SheetDescription>
          </SheetHeader>

          {plans.length > 1 && (
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-2">
              <span className="text-ui-xs text-muted-foreground">
                {currentIndex + 1} of {plans.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!hasPrev}
                  onClick={() => hasPrev && setSelectedPlanPath(plans[currentIndex - 1].path)}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={!hasNext}
                  onClick={() => hasNext && setSelectedPlanPath(plans[currentIndex + 1].path)}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {loading ? (
              <p className="text-ui-sm text-muted-foreground">Loading...</p>
            ) : activePlan ? (
              <MarkdownRenderer
                markdown={activePlan.content}
                className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              />
            ) : (
              <p className="text-ui-sm text-muted-foreground">No plan to display.</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
