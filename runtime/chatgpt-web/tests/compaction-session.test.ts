import { expect, test } from "bun:test";
import {
  createCompactionState,
  InvalidCompactionTransitionError,
  reduceCompactionState,
} from "../src/core/compaction/compaction-session";

test("structured compaction completes logically when the handoff is accepted", () => {
  let state = createCompactionState();
  state = reduceCompactionState(state, { type: "settle_source", at: 1 });
  state = reduceCompactionState(state, { type: "wait_handoff", at: 2, transactionId: "handoff-1" });
  state = reduceCompactionState(state, { type: "handoff_received", at: 3 });
  state = reduceCompactionState(state, { type: "complete", at: 4 });
  expect(state).toMatchObject({
    phase: "completed",
    sequence: 4,
    handoffReceived: true,
    browserRetired: false,
  });
});

test("legacy physical-retirement path remains deterministic", () => {
  let state = createCompactionState();
  state = reduceCompactionState(state, { type: "wait_handoff", at: 1, transactionId: "handoff-1" });
  state = reduceCompactionState(state, { type: "handoff_received", at: 2 });
  state = reduceCompactionState(state, { type: "retire_browser", at: 3 });
  state = reduceCompactionState(state, { type: "browser_retired", at: 4 });
  expect(state).toMatchObject({ phase: "completed", browserRetired: true });
});

test("compaction cannot complete before a structured handoff", () => {
  let state = createCompactionState();
  state = reduceCompactionState(state, { type: "wait_handoff", at: 1, transactionId: "handoff-1" });
  expect(() => reduceCompactionState(state, { type: "complete", at: 2 }))
    .toThrow(InvalidCompactionTransitionError);
  expect(() => reduceCompactionState(state, { type: "browser_retired", at: 2 }))
    .toThrow(InvalidCompactionTransitionError);
});

test("compaction failure and cancellation are terminal", () => {
  let failed = createCompactionState();
  failed = reduceCompactionState(failed, { type: "fail", at: 1, reason: "missing handoff" });
  expect(failed.phase).toBe("failed");
  expect(() => reduceCompactionState(failed, { type: "settle_source", at: 2 }))
    .toThrow(InvalidCompactionTransitionError);

  let cancelled = createCompactionState();
  cancelled = reduceCompactionState(cancelled, { type: "cancel", at: 1, reason: "operator" });
  expect(cancelled).toMatchObject({ phase: "cancelled", terminalReason: "operator" });
});
