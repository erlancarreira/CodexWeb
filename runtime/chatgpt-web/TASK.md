# TASK — Web Event-Driven Turn Engine

Branch: `feat/web-event-driven-turn-engine`

Goal: refactor CodexNative Web into a Web-only, backend-local, event-driven runtime where turn lifecycle is governed by a deterministic state machine instead of scattered polling/retry logic.

## Non-negotiable architecture rules

- [x] Web-only: no OpenAI API provider and no direct private ChatGPT backend calls.
- [x] Browser owns authentication/session.
- [x] Network/CDP is the transport lifecycle authority.
- [x] DOM is a rendering/control adapter, not the transport authority.
- [x] MCP/tunnel emits tool lifecycle events; it does not mutate turn state directly.
- [x] Single-writer principle: only the Turn Actor/Reducer changes turn state.
- [x] No operational polling as the normal control path.
- [x] No arbitrary `sleep()` synchronization.
- [x] No unbounded retry loops.
- [x] No unbounded event queues.
- [x] No silent fallbacks.
- [x] No new god class replacing `browser-worker.ts`.
- [x] Modular monolith with explicit ports/adapters.
- [x] Timers are limited to deadline, heartbeat and watchdog responsibilities.

## Phase 0 — repository safety and baseline

- [x] Create isolated feature branch from `main`.
- [x] Create this `TASK.md`.
- [x] Open a draft PR and use it as the execution log.
- [x] Inspect current remote implementation and establish integration seams.
- [x] Document baseline invariants and existing network/DOM/MCP responsibilities.

## Phase 1 — domain event model

- [x] Add typed immutable turn events.
- [x] Add explicit turn states and terminal states.
- [x] Add deterministic reducer/state-transition rules.
- [x] Reject invalid state transitions explicitly.
- [x] Add monotonic event sequence support.
- [x] Add unit tests for valid/invalid transitions.

Acceptance:
- State transitions can be tested without browser, DOM, CDP, MCP or timers.
- No external adapter can directly mutate domain state.

## Phase 2 — per-request transport state

- [x] Add request-level transport model keyed by request id.
- [x] Track request lifecycle independently: sent/accepted/data/finished/failed.
- [x] Preserve response status, byte count, chunk count and terminal reason per request.
- [x] Add request correlation policy for the primary assistant transport.
- [x] Prevent auxiliary/retry requests from overwriting the primary request.
- [x] Add tests for 200 primary + 404 auxiliary, redirects, retries and aborted requests.

Acceptance:
- A secondary request can never corrupt the authoritative status of the primary stream.
- `ERR_ABORTED` can be classified using request-local evidence.

## Phase 3 — Turn Actor / mailbox

- [x] Add one actor/mailbox per turn.
- [x] Enforce single writer for turn state.
- [x] Add bounded queue semantics.
- [x] Coalesce high-frequency replaceable events such as DOM revisions/progress.
- [x] Preserve non-droppable terminal/tool/network events.
- [x] Add deterministic shutdown/cancellation.
- [x] Add actor tests including concurrent producers.

Acceptance:
- CDP, DOM, MCP and launcher can publish concurrently without racing on turn state.
- Queue cannot grow without bound.

## Phase 4 — browser/CDP adapter

- [x] Extract transport observation out of browser orchestration.
- [x] Convert Playwright request/response/requestfinished/requestfailed to typed events.
- [x] Convert CDP requestWillBeSent/responseReceived/dataReceived/loadingFinished/loadingFailed to typed events.
- [x] Correlate Playwright/CDP observations without double-counting.
- [x] Keep browser/session ownership independent from turn domain.
- [x] Add tests for navigation, 2xx+data+ERR_ABORTED and genuine pre-response failure.

Acceptance:
- Browser transport publishes events only; lifecycle decisions remain in Core.

## Phase 5 — DOM adapter

- [x] Convert MutationObserver/assistant surface observations to typed events.
- [x] Add revision-based coalescing.
- [x] Remove DOM as a prerequisite for network-active turn survival.
- [x] Keep DOM responsibilities limited to rendered text, controls, confirmations and surface identity.
- [x] Make surface-loss recovery explicit and bounded.
- [x] Add tests for DOM detach/remount while network remains active.

Acceptance:
- DOM disappearance alone cannot fail an otherwise healthy streaming turn.

## Phase 6 — completion and failure policies

- [x] Centralize completion policy.
- [x] Centralize transport-failure classification.
- [x] Centralize retry/recovery policy.
- [x] Add explicit benign/recoverable/retryable/terminal classifications.
- [x] Remove scattered retry decisions from browser code where migrated.
- [x] Add bounded recovery budgets.
- [x] Add tests for known historical failures.

Historical scenarios:
- [x] HTTP 200 + data + post-response `ERR_ABORTED`.
- [x] Missing assistant DOM while network progresses.
- [x] Surface rebind during an active stream.
- [x] Secondary 404 after a valid primary response.
- [x] Browser observation timeout.
- [x] Real transport failure before response/data.

## Phase 7 — compaction engine isolation

- [x] Separate compaction session lifecycle from normal assistant streaming.
- [x] Keep provisional renderer projections internal.
- [x] Serialize one final checkpoint after completion fence.
- [x] Integrate retained-compaction handoff through domain events.
- [x] Remove dependence on normal streaming consistency rules for provisional compaction text.
- [x] Add rewrite/remount/cancel/retry tests.

Acceptance:
- Provisional renderer rewrites cannot produce client-visible retraction errors.
- Compaction completion is deterministic.

## Phase 8 — MCP/tool lifecycle integration

- [x] Model tool requested/started/completed/failed events.
- [x] Keep tool runtime behind a port.
- [x] Make WAITING_TOOL / TOOL_RUNNING transitions explicit.
- [x] Preserve Codex approvals/sandbox behavior.
- [x] Ensure tunnel reconnect cannot mutate an unrelated turn.
- [x] Add tool timeout/cancel/reconnect tests.

## Phase 9 — supervisors and resilience

- [x] Add Turn Supervisor boundary.
- [x] Add Browser Supervisor boundary.
- [x] Preserve Runtime/Tunnel supervisor ownership rules.
- [x] Add named deadline/watchdog policies.
- [x] Remove migrated magic timeout values from orchestration paths.
- [x] Ensure one turn/browser fault does not corrupt unrelated turns.

## Phase 10 — integration into existing adapter

- [x] Wire new Core into ChatGPT Web adapter incrementally.
- [x] Preserve public Responses behavior.
- [x] Preserve Browser-only.
- [x] Preserve Full Harness.
- [x] Preserve Zero Risk behavior outside automatic browser lifecycle.
- [x] Preserve saved/temporary chat configuration.
- [x] Preserve existing diagnostics during migration.
- [x] Remove dead legacy orchestration paths only after replacement tests pass.

## Phase 11 — observability

- [x] Emit structured trace events with traceId/turnId/requestId/source/sequence/timestamp.
- [x] Keep sensitive values redacted.
- [x] Add final state + causal terminal event to diagnostics.
- [x] Make event history sufficient to reconstruct a failed turn.
- [x] Avoid duplicate CDP/Playwright accounting.

## Phase 12 — fault injection and regression coverage

- [x] DOM disappears during stream.
- [x] DOM remounts with a new revision.
- [x] 200 + chunks + ERR_ABORTED.
- [x] Request fails before response.
- [x] Primary 200 plus auxiliary 404.
- [x] Tool call stalls.
- [x] Tool completes after DOM remount.
- [x] Tunnel restarts.
- [x] Browser reconnects.
- [x] Codex cancels mid-turn.
- [x] Two simultaneous turns.
- [x] Compaction rewrites provisional renderer.
- [x] Compaction is cancelled/replaced.
- [x] Event queue pressure/coalescing.

## Phase 13 — validation and cleanup

- [x] Typecheck.
- [x] Focused unit tests.
- [x] Browser contract tests.
- [x] Compaction tests.
- [x] MCP/tunnel relevant tests.
- [x] Full test suite where the available CI runner supports it.
- [x] Build.
- [x] Diff/format check.
- [x] Review for polling/sleep/unbounded-loop regressions.
- [x] Update architecture documentation.
- [x] Update this task file to 100% complete.
- [x] Mark PR ready.
- [x] Merge only after validation evidence is attached to the PR.

## Execution log

- 2026-09-30 — Branch created. Architecture constraints and complete task plan recorded.
- 2026-09-30 — Draft PR #1 opened. Remote baseline inspected: Playwright/CDP/MutationObserver are event sources, while the main browser orchestration still uses observation loops and distributed completion/retry decisions. Core migration seams identified.
- 2026-09-30 — Phases 1–4 core foundations implemented: deterministic turn reducer, bounded single-writer actor, per-request transport state, CDP-primary/Playwright-fallback tracker, request correlation and regression coverage.
- 2026-09-30 — Main response observation path converted from fixed 250 ms polling to DOM/MCP/network event wakes with a named watchdog only. Missing-assistant/stream-failure/stall decisions centralized in a pure lifecycle policy.
- 2026-09-30 — Phase 5 completed: MutationObserver-backed DOM snapshots now flow through a typed lifecycle adapter with monotonic revisions; surface loss/remount are non-terminal observations and network-active turns remain alive.
- 2026-09-30 — Phase 6 completed: browser observation/rebind retries now use named bounded Core recovery budgets; historical failure semantics are locked in a dedicated regression suite.
- 2026-09-30 — Phase 7 completed: structured compaction now has its own application coordinator/state journal; provisional Markdown is never streamed, remount resets only provisional compaction projection, and existing retained-compaction retry/cancel coverage plus new remount tests lock the behavior.
- 2026-09-30 — Phase 8 completed: MCP execution is behind a ToolRuntimePort, per-turn tool transitions are centralized, same-batch reconnect is idempotent, foreign/late tool events fail closed, and existing Codex approval/sandbox behavior remains in the broker boundary.
- 2026-09-30 — Phase 9 completed: automatic Web turns and browser workers now have explicit supervisors; Runtime/Tunnel ownership remains unchanged; lifecycle timing uses named deadline/settle/watchdog policies and supervisor tests prove turn isolation.
- 2026-09-30 — Phase 11 completed: daemon and launcher-helper lifecycles expose bounded structured traces with trace/turn/request identity, monotonic sequence, source and timestamp; terminal causes are redacted; CDP-primary/Playwright-fallback transport prevents duplicate accounting.

- 2026-09-30 — Phase 10 integration review completed: automatic Browser-only and Full Harness use the actor-owned lifecycle end-to-end, launcher-helper lifecycle events round-trip to the daemon actor, Zero Risk stays outside automatic browser lifecycle, and diagnostics preserve structured lifecycle snapshots.
- 2026-09-30 — Phase 12 fault-injection matrix completed in tests. Additional hardening fixed recoverable primary-request takeover and prevented DOM coalescing from crossing critical mailbox event boundaries.
- 2026-09-30 — Woodpecker repository enabled by the owner; CI validation gate is now active for Phase 13.

- 2026-09-30 — Woodpecker repository enabled by owner; branch push used to trigger the first CI validation for this refactor.
- 2026-09-30 — First Woodpecker gate: install/contracts/event-core passed; browser-contracts failed only because two real helper-process IPC tests exceeded Bun's 5s timeout while running concurrently with the heavy browser contract suite. CI was restructured to run helper IPC contracts in an isolated step without weakening assertions or extending the test timeout.

- 2026-09-30 — First Woodpecker PR run reached browser-contracts: 159 tests passed and 2 real-helper integration tests exceeded Bun's default 5s test timeout in CI. Production timeouts were unchanged; only those subprocess integration tests received an explicit 15s test budget.
- 2026-09-30 — Full-tests proved 891 Bun tests with 0 failures; launcher node:test failed because the Bun ARM64 image provides a Node compatibility shim. The launcher node:test suite moved to a real Node 22 runner without weakening assertions.

- 2026-09-30 — Localized README parity was corrected without weakening the contract: all localized READMEs now match the CodexNative Web README's 10 command fences and 7 link targets, with no stale project references.
- 2026-09-30 — Phase 13 code validation green. Current PR HEAD 3a7c905 has both Woodpecker push and PR statuses green; final validation evidence was attached to PR #1. PR is ready for review; merge remains the only outstanding task.

- 2026-09-30 — PR #1 merged into `main` after the current HEAD passed both Woodpecker push and PR gates. Task plan closed at 100%.


## Phase 14 — first installable CodexNative Web release

- [x] Confirm event-driven architecture is merged into `main`.
- [x] Disable GitHub Actions workflows; Woodpecker remains the CI gate.
- [x] Bump synchronized product/runtime/launcher version to `6.2.0`.
- [ ] Wait for Woodpecker validation on the version commit.
- [ ] Build and smoke-test the Windows x64 launcher from a clean GitHub source snapshot.
- [ ] Assemble checksummed release assets and release notes.
- [ ] Publish GitHub release `v6.2.0`.
- [ ] Update the current Windows installation to `6.2.0`.
- [ ] Verify launcher/runtime health and a real Web turn after update.
- [ ] Confirm installation instructions for a second Windows user.

### Release execution log

- 2026-09-30 — Release preparation started. Repository had no previous published GitHub releases; v6.2.0 will be the first installable CodexNative Web release.
