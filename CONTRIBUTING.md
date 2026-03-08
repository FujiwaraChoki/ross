# Contributing to Ross

Ross is a desktop GUI for Codex built with Electron, React, and TypeScript.

## Before you start

- Install dependencies with `pnpm install`
- Make sure the `codex` CLI is installed and available on your `PATH`
- Authenticate locally with `codex login`
- Optional for voice input: install `ffmpeg` and `whisper.cpp`, then download a local Whisper model

## Development workflow

```bash
pnpm dev
```

This starts Electron and the Vite renderer in development mode.

## Required checks

Run these before opening a pull request:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Manual smoke tests

If your change affects the UI, IPC, or Codex integration, include short notes for:

- Login flow
- Starting the Codex app server
- Sending a chat turn
- Approval dialog behavior
- Voice transcription, if touched
- Git/project actions, if touched

## Pull request guidance

- Keep changes focused and explain why they were made
- Include screenshots or GIFs for visible UI changes
- Call out any platform-specific behavior or setup requirements
- Mention any follow-up work that still needs a maintainer decision

## Licensing

By contributing, you agree that your contributions will be licensed under the
terms in [LICENSE](./LICENSE).
