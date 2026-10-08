# CodexWeb

CodexWeb is the single canonical repository for the Codex Web desktop integration. It combines the patched Codex app-server/CLI and the ChatGPT Web runtime into one source tree, one release pipeline, and one Windows installer.

## What is included

- `crates/codex/` - patched OpenAI Codex source used to build `codex-native.exe`.
- `runtime/chatgpt-web/` - ChatGPT Web Responses bridge, launcher, browser host, MCP/tunnel integration, and updater.
- `packaging/windows/` - Windows bootstrap and startup scripts.
- `scripts/` - unified release staging and repository automation.
- `.github/workflows/windows-release.yml` - reproducible Windows build and release pipeline.

CodexWeb is the canonical source and release repository. The former split repositories have been consolidated here and are retired.

## Windows installation

### Requirements

- Windows 11 x64.
- The official OpenAI Codex Windows app installed for the current user.
- A ChatGPT account eligible for the model(s) you want to use.

CodexWeb does **not** redistribute the proprietary OpenAI desktop application. During first setup it detects the user's locally installed official `OpenAI.Codex` package and stages a private working copy under `%LOCALAPPDATA%\CodexWeb`. The user's own ChatGPT login, browser profile, tunnel credentials, and API keys remain local and are never included in a release artifact.

### Install

1. Download `CodexWeb-Setup-<version>-x64.exe` and `checksums.txt` from this repository's GitHub Release.
2. Verify the SHA-256 checksum when distributing outside GitHub.
3. Run the installer.
4. Open **Codex Web** and complete the launcher setup/sign-in using your own ChatGPT account.
5. Use the **Codex Web** desktop or Start Menu shortcut.

Existing 6.2.0 configurations that were created with the terminal-managed `managed-chrome` host are a trusted migration source. On the 6.2.1 launcher upgrade they are adopted transactionally into launcher ownership, with rollback preserving the previous runtime if migration cannot complete.

The default startup model is:

```toml
model = "chatgpt-web/high"
model_reasoning_effort = "high"
```

This corresponds to **GPT-5.6 Sol (Web) - Alto**.

## Runtime lifecycle on Windows

CodexWeb owns the complete local startup sequence:

1. the GUI-only `CodexWeb.exe` starts a hidden serialized bootstrap without opening a terminal;
2. the hidden bootstrap starts/verifies the Codex Web launcher and browser runtime;
3. verify the local Responses proxy on `127.0.0.1:17841`, starting it when needed and keeping it under a loopback health watchdog;
4. start the OpenAI tunnel-client and wait for `/healthz`, `/readyz`, and a dispatcher registration where the MCP `main` channel is actually routable;
5. start the patched Codex app-server on `127.0.0.1:45891`, validate that this exact binary owns the listener, and only then open/focus the isolated Codex desktop profile;
6. keep the selected startup default pinned to GPT-5.6 Sol Web High.

A startup mutex prevents simultaneous shortcuts from racing to bind port `45891`. The readiness gate also prevents the desktop from connecting before its app-server is listening or a first MCP request from racing ahead of the tunnel dispatcher. The proxy watchdog removes the earlier failure mode where the app-server stayed alive while the Responses proxy disappeared, producing `Reconnecting... Connection failed: error sending request`.

Remote compaction also treats managed-browser bootstrap as its own pre-submission phase. If the dedicated Chrome/Brave profile is left with a stale process or singleton lock, CodexWeb cleans that ownership and retries one time before CDP exists. Because no ChatGPT prompt can have been submitted before CDP is available, this recovery does not duplicate a compaction request. A live 6.2.1 `/v1/responses/compact` handoff was used to validate the final path.

## Windows release

Windows releases are built only by GitHub Actions. Do not compile the Rust runtime, native desktop launcher, or NSIS package on a workstation. The `Windows Release` workflow builds the complete payload from committed source and publishes the installer as a workflow artifact.

The generated distributable is named:

```text
CodexWeb-Setup-<version>-x64.exe
```

## Release pipeline

Pushing tag `vX.Y.Z` runs the unified Windows workflow. It:

- validates LF-stable SQL migration checksums;
- builds the patched Rust `codex.exe`;
- installs the pinned Bun runtime;
- runs the packaging/type tests;
- builds the GUI-only `CodexWeb.exe` desktop launcher and stages it with the native binary and Windows bootstrap;
- builds the NSIS installer;
- generates `checksums.txt`;
- publishes the GitHub Release.

## Security boundaries

- No ChatGPT session, browser profile, tunnel ID, runtime key, API key, or local user configuration is committed or packaged.
- The official OpenAI desktop app is discovered locally instead of being bundled.
- Release checksums bind the installer artifact.
- Runtime and app-server bind to loopback interfaces.
- The Windows installer is currently unsigned unless a trusted Authenticode certificate is configured for the release environment. Windows SmartScreen may therefore warn on first execution.

## Upstream synchronization

The Codex source remains structurally isolated under `crates/codex/`, and the ChatGPT Web runtime remains under `runtime/chatgpt-web/`. This keeps upstream merges reviewable while presenting a single repository and a single installer to end users.
