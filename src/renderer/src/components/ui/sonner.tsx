import { Toaster as SonnerToaster } from 'sonner'
import type { ReactElement } from 'react'

export function Toaster(): ReactElement {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'var(--popover)',
          color: 'var(--popover-foreground)',
          border: '1px solid var(--border)',
          fontSize: '13px'
        }
      }}
    />
  )
}
