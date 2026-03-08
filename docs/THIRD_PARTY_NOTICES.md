# Third-Party Notices

Ross includes third-party open-source software. Those components remain under
their own licenses.

## Direct runtime dependencies

### MIT

- `@base-ui/react`
- `@electron-toolkit/preload`
- `@electron-toolkit/utils`
- `clsx`
- `cmdk`
- `framer-motion`
- `ignore`
- `react-markdown`
- `remark-gfm`
- `shadcn`
- `shiki`
- `tailwind-merge`
- `tw-animate-css`
- `zustand`

### Apache-2.0

- `class-variance-authority`

### ISC

- `lucide-react`

### SIL Open Font License 1.1

- `@fontsource-variable/geist`
- `@fontsource-variable/geist-mono`

## Notes

- Build-time and transitive dependencies also carry their own licenses.
- The authoritative license text for each dependency is the one distributed by
  that dependency.
- To regenerate a dependency inventory locally, run:

```bash
pnpm licenses list --prod --json
```
