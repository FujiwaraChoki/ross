import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { spawn } from 'child_process'

export function getAuthPath(): string {
  return join(homedir(), '.codex', 'auth.json')
}

export function isAuthenticated(): boolean {
  return existsSync(getAuthPath())
}

export function login(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('codex', ['login'], { stdio: 'inherit' })
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error('Login failed'))))
    proc.on('error', reject)
  })
}
