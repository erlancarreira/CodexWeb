# TASK

## Consolidation
- [x] Create unified `erlancarreira/CodexWeb` repository.
- [x] Import patched CodexNative source under `crates/codex`.
- [x] Import ChatGPT Web runtime source under `runtime/chatgpt-web`.
- [x] Keep both source domains isolated inside one canonical repository.
- [x] Add unified Windows release workflow.
- [ ] Add repeatable upstream synchronization helpers after the first unified release is validated.

## Runtime reliability
- [x] Fix desktop ECONNREFUSED at 127.0.0.1:45891: delay GUI until app-server readiness, serialize bootstrap and validate listener ownership.
- [x] Install the Responses proxy watchdog alongside the managed Windows bootstrap and smoke-test the updated local script.
- [x] Add GPT-5.6 Sol Web Light/Medium/High picker aliases to the patched app-server.
- [x] Preserve SQL migration LF checksums on Windows.
- [x] Default startup to `chatgpt-web/high` with reasoning `high`.
- [x] Start/health-check the Responses proxy on Windows before the app-server.
- [x] Add a Responses-proxy watchdog and prove automatic recovery after killing the proxy.
- [x] Gate native startup on tunnel `/healthz`, `/readyz`, and a routable MCP `main` dispatcher channel.
- [x] Cold-start verify that the tunnel becomes MCP-routable before the native app-server and desktop start.
- [x] Recover stale managed-Chrome profile ownership and retry one safe pre-CDP bootstrap failure.
- [x] Retry fresh remote compaction once when managed Chrome fails before CDP/prompt submission.
- [x] Validate a real `/v1/responses/compact` handoff on the live 6.2.1 runtime.
- [x] Validate real app-server `model/list` against the installed patched binary.
- [x] Pin clean installations to verified OpenAI tunnel-client v0.0.15 while allowing trusted upgrade from previously shipped versions.

## Windows distribution
- [x] Build and verify patched `codex-native.exe`.
- [x] Package runtime/launcher from the unified repository.
- [x] Detect/require the official OpenAI Codex Windows package instead of redistributing proprietary desktop binaries.
- [x] Create one user-facing NSIS installer/bootstrapper.
- [x] Add automatic adoption of the trusted 6.2.0 terminal-managed runtime into launcher ownership.
- [x] Add CI pipeline that builds Rust + runtime + installer from the unified repository.
- [ ] Rebuild the installer with the final tunnel/compaction reliability fixes.
- [ ] Run the final packaged-launcher smoke test in an isolated environment.
- [ ] Validate the 6.2.0 -> 6.2.1 managed desktop migration end to end without modifying the primary development install.
- [ ] Regenerate the final SHA-256 release manifest.
- [ ] Commit and push final unified release changes.
- [ ] Create and validate GitHub tag/release `v6.2.1`.
- [ ] Confirm the published installer/checksum can be downloaded and installed from the release.
