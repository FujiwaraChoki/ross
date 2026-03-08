/// <reference types="vite/client" />

import type { CodexApi } from '../../preload/index'

declare global {
  interface Window {
    codex: CodexApi
  }
}
