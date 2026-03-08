import { useEffect, useState, type ReactElement } from 'react'
import { useCodexStore } from '@/lib/store'

interface Model {
  id: string
  name?: string
}

export default function ModelSelector(): ReactElement {
  const { model, setModel } = useCodexStore()
  const [models, setModels] = useState<Model[]>([])

  useEffect(() => {
    void window.codex
      .modelList()
      .then((result) => {
        const data = result as { models?: Model[] }
        if (data?.models) {
          setModels(data.models)
        }
      })
      .catch(() => {
        // Fallback models if server isn't ready.
        setModels([
          { id: 'o4-mini', name: 'o4-mini' },
          { id: 'o3', name: 'o3' },
          { id: 'codex-mini', name: 'codex-mini' }
        ])
      })
  }, [])

  return (
    <div className="relative no-drag">
      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="appearance-none bg-secondary border border-border rounded-lg px-3 py-1.5 pr-7 text-sm text-muted-foreground hover:border-ring focus:outline-none focus:border-ring transition-colors cursor-pointer"
      >
        {models.length > 0 ? (
          models.map((m) => (
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
