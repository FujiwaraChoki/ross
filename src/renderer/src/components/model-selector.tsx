import { type ReactElement } from 'react'
import { useCodexStore } from '@/lib/store'

export default function ModelSelector(): ReactElement {
  const { model, setModel, availableModels } = useCodexStore()

  return (
    <div className="relative no-drag">
      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="appearance-none bg-secondary border border-border rounded-lg px-3 py-1.5 pr-7 text-ui-sm text-muted-foreground hover:border-ring focus:outline-none focus:border-ring transition-colors cursor-pointer"
      >
        {availableModels.length > 0 ? (
          availableModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name || m.id}
            </option>
          ))
        ) : (
          <option value={model}>{model}</option>
        )}
      </select>
      <svg
        className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  )
}
