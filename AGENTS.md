# Repository Guidelines

## Project Structure & Module Organization
- `src/main/`: Electron main process (window lifecycle, IPC handlers, Codex server integration).
- `src/preload/`: secure bridge exposed to the renderer as `window.codex`.
- `src/renderer/src/`: React UI (`components/`, `lib/`, `assets/`).
- `src/renderer/public/`: static assets (including bundled fonts).
- `build/` and `resources/`: app icons, entitlements, and packaging assets.
- `docs/CODEX_INTEGRATION.md`: architecture and event-flow reference for Codex-related work.

## Build, Test, and Development Commands
- `pnpm install`: install dependencies.
- `pnpm dev`: run Electron + Vite in development mode.
- `pnpm start`: preview built output.
- `pnpm lint`: run ESLint across the repo.
- `pnpm format`: apply Prettier formatting.
- `pnpm typecheck`: run TypeScript checks for node and web targets.
- `pnpm build`: typecheck, then produce production build.
- `pnpm build:mac` / `pnpm build:win` / `pnpm build:linux`: create platform packages.

## Coding Style & Naming Conventions
- Use 2-space indentation, LF line endings, UTF-8 (`.editorconfig`).
- Prettier is the source of truth: single quotes, no semicolons, width 100 (`.prettierrc.yaml`).
- Follow ESLint (TypeScript + React hooks + react-refresh rules).
- Naming:
  - Component files: kebab-case (example: `settings-dialog.tsx`).
  - Component/type names: PascalCase.
  - Variables/functions: camelCase.
  - Constants: UPPER_SNAKE_CASE.
- Prefer path aliases `@/` or `@renderer/` for renderer imports.

## Testing Guidelines
- No automated test runner is configured yet.
- Minimum pre-PR checks: `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- For UI or IPC changes, include manual smoke-test steps (for example: login flow, start server, send a chat turn, approval dialog behavior).

## Commit & Pull Request Guidelines
- Follow concise, imperative commit messages; Conventional Commit prefixes are preferred (`feat:`, `fix:`, `chore:`).
- Keep commits focused by concern (renderer, main, preload, build config).
- PRs should include:
  - What changed and why.
  - Linked issue/ticket (if applicable).
  - Screenshots/GIFs for renderer/UI changes.
  - Commands run and manual verification notes.
