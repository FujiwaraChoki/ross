export type CodexEventSource = 'appServer' | 'hostBridge'

export interface CodexEvent {
  method: string
  params: Record<string, unknown>
  requestId?: number | string
  source?: CodexEventSource
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

export function coerceCodexEvent(
  value: unknown,
  defaultSource: CodexEventSource = 'hostBridge'
): CodexEvent | null {
  const record = asObject(value)
  if (!record) return null

  const method = typeof record.method === 'string' ? record.method : null
  if (!method) return null

  const params = asObject(record.params) || {}
  const requestId =
    typeof record.requestId === 'string' || typeof record.requestId === 'number'
      ? record.requestId
      : undefined
  const source =
    record.source === 'appServer' || record.source === 'hostBridge' ? record.source : defaultSource

  return {
    method,
    params,
    requestId,
    source
  }
}
