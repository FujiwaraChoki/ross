# Ross

Ross is a desktop GUI for Codex. It wraps `codex app-server` in an Electron app
with a chat interface, streaming responses, command approvals, project context,
and optional local voice transcription.

## License

Ross is released under the [Ross Non-Resale Source License 1.0](./LICENSE).
You can use, modify, and share the code, but commercial resale, white-label
distribution, and paid hosted offerings require written permission from
Sami Hindi at [sami@samihindi.com](mailto:sami@samihindi.com).

This is source-available, not OSI-approved open source.

## Highlights

- Streaming chat UI for Codex turns
- Command and file-change approval flows
- Project picker and file reference support
- Skills browser
- Git status and commit helpers
- Local voice transcription with `ffmpeg` and `whisper.cpp`

## Prerequisites

Ross is not a standalone Codex distribution. It currently depends on local
tools you install yourself.

Required:

- `pnpm`
- `codex` CLI on your `PATH`
- local Codex auth from `codex login`

Optional for voice input:

- `ffmpeg`
- `whisper.cpp`
- a local GGML Whisper model

## Getting started

```bash
pnpm install
pnpm dev
```

Then:

1. Run `codex login` if you have not authenticated yet.
2. Start Ross.
3. Open a project and begin a thread.

## Build

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Platform packages:

```bash
pnpm build:mac
pnpm build:mac:release
pnpm build:win
pnpm build:linux
```

Ross is developed primarily on macOS. Linux and Windows packaging targets are
included, but you should expect to validate them locally before release.

`pnpm build:mac:release` uses the local `ross-notary` notarytool keychain
profile when it is available on the machine.

## Local voice transcription

Voice transcription runs fully local via `ffmpeg` and `whisper.cpp`.

macOS example:

```bash
brew install ffmpeg whisper-cpp
mkdir -p ~/.cache/whisper
curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin \
  -o ~/.cache/whisper/ggml-base.en.bin
```

If the model lives elsewhere:

```bash
export WHISPER_MODEL_PATH=/absolute/path/to/ggml-base.en.bin
```

Optional environment variables:

- `WHISPER_COMMAND`
- `FFMPEG_COMMAND`
- `WHISPER_LANGUAGE`

## Project structure

- `src/main/`: Electron main process and Codex integration
- `src/preload/`: secure bridge exposed as `window.codex`
- `src/renderer/src/`: React renderer code
- `build/` and `resources/`: packaging assets
- `docs/CODEX_INTEGRATION.md`: architecture and event-flow details
- `docs/THIRD_PARTY_NOTICES.md`: third-party dependency notices summary

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, checks, and PR expectations.

## Security

See [SECURITY.md](./SECURITY.md) for private vulnerability reporting.
