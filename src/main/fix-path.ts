import { execFileSync } from 'child_process'

function mergePathEntries(...pathValues: string[]): string {
  const entries = pathValues
    .flatMap((value) => value.split(':'))
    .map((value) => value.trim())
    .filter(Boolean)

  return Array.from(new Set(entries)).join(':')
}

/**
 * macOS (and Linux) apps launched from the GUI receive a minimal PATH
 * that doesn't include user-installed binaries (Homebrew, cargo, etc.).
 * This resolves the user's full login-shell PATH so spawned processes
 * like `codex` and `git` can be found.
 */
export function fixPath(): void {
  if (process.platform !== 'darwin' && process.platform !== 'linux') return

  const shell = process.env.SHELL || '/bin/zsh'
  const preferredPaths = [
    `${process.env.HOME}/.bun/bin`,
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    `${process.env.HOME}/.local/bin`,
    `${process.env.HOME}/.cargo/bin`
  ].join(':')

  try {
    const result = execFileSync(shell, ['-lc', 'printf "%s" "$PATH"'], {
      encoding: 'utf8',
      timeout: 5000
    }).trim()

    process.env.PATH = mergePathEntries(preferredPaths, result, process.env.PATH || '')
  } catch {
    process.env.PATH = mergePathEntries(preferredPaths, process.env.PATH || '')
  }
}
