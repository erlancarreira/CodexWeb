import { expect, test } from "bun:test";
import { CompactionLifecycleCoordinator } from "../src/application/compaction-lifecycle-coordinator";

test("compaction coordinator commits logical success independently of browser teardown", async () => {
  let now = 0;
  const lifecycle = new CompactionLifecycleCoordinator({ now: () => ++now });
  await lifecycle.settleSource();
  await lifecycle.waitHandoff("handoff-1");
  await lifecycle.handoffReceived();
  await lifecycle.complete();

  expect(lifecycle.snapshot()).toMatchObject({
    phase: "completed",
    handoffReceived: true,
    browserRetired: false,
    sequence: 4,
  });
  expect(lifecycle.events().map(event => event.type)).toEqual([
    "settle_source",
    "wait_handoff",
    "handoff_received",
    "complete",
  ]);
});

test("compaction coordinator cancellation is terminal and deterministic", async () => {
  const lifecycle = new CompactionLifecycleCoordinator();
  await lifecycle.settleSource(1);
  await lifecycle.cancel("replaced", 2);
  expect(lifecycle.snapshot()).toMatchObject({ phase: "cancelled", terminalReason: "replaced" });
  await expect(lifecycle.waitHandoff("late", 3)).rejects.toThrow("Invalid compaction transition");
});
