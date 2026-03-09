import { execFileSync } from 'child_process'

/**
 * macOS (and Linux) apps launched from the GUI receive a minimal PATH
 * that doesn't include user-installed binaries (Homebrew, cargo, etc.).
 * This resolves the user's full login-shell PATH so spawned processes
 * like `codex` and `git` can be found.
 */
export function fixPath(): void {
  if (process.platform !== 'darwin' && process.platform !== 'linux') return

  const shell = process.env.SHELL || '/bin/zsh'

  try {
    const result = execFileSync(shell, ['-lc', 'printf "%s" "$PATH"'], {
      encoding: 'utf8',
      timeout: 5000
    }).trim()

    if (result) {
      process.env.PATH = result
    }
  } catch {
    // Fallback: prepend common paths that are likely missing
    const additions = [
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/local/bin',
      '/usr/local/sbin',
      `${process.env.HOME}/.local/bin`,
      `${process.env.HOME}/.cargo/bin`
    ]
    const current = (process.env.PATH || '').split(':')
    process.env.PATH = [...additions.filter((p) => !current.includes(p)), ...current].join(':')
  }
}
