# CodexWeb

Unified repository for the Codex Web desktop integration.

## Layout

- `crates/codex/` - patched OpenAI Codex fork used by the desktop app-server.
- `runtime/chatgpt-web/` - ChatGPT Web runtime, launcher and browser bridge.
- `packaging/` - unified installer/release tooling.
- `scripts/` - repository orchestration and upstream sync helpers.
- `docs/` - architecture, release and installation documentation.

The goal is one repository, one Windows release pipeline and one user-facing installer. Users authenticate with their own ChatGPT account; credentials and browser profiles are never distributed.
