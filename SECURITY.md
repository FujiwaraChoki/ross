# Security Policy

## Reporting a vulnerability

Please report suspected security issues privately to:

- `sami@samihindi.com`

Include as much detail as you can:

- affected version or commit
- operating system
- reproduction steps
- potential impact
- logs, screenshots, or proof of concept if available

Please do not open public issues for security-sensitive reports until we have
had a chance to investigate and coordinate a fix.

## Scope notes

Ross is a local desktop app that can:

- start the `codex` CLI on your machine
- access local project files you choose
- request command execution through Codex
- use microphone access for local transcription

Because of that, changes touching Electron permissions, preload APIs, file
access, shell execution, or configuration file writes should be reviewed with
extra care.
