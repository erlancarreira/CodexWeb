import { expect, test } from "bun:test";
import { WebTurnLifecycleCoordinator } from "../src/application/web-turn-lifecycle-coordinator";

test("web turn lifecycle coordinator owns actor initialization and bounded journal", async () => {
  let now = 100;
  const lifecycle = new WebTurnLifecycleCoordinator({
    maxJournalEvents: 32,
    now: () => now++,
  });

  await lifecycle.submissionSent();
  await lifecycle.dispatch("transport", {
    type: "transport_accepted",
    at: now++,
    requestId: "r1",
    status: 200,
  });
  await lifecycle.dispatch("transport", {
    type: "transport_data",
    at: now++,
    requestId: "r1",
    bytes: 10,
  });

  expect(lifecycle.snapshot()).toMatchObject({
    phase: "streaming",
    sequence: 4,
    primaryRequestId: "r1",
  });
  expect(lifecycle.events().map(item => item.event.type)).toEqual([
    "prepare",
    "submission_sent",
    "transport_accepted",
    "transport_data",
  ]);
});

test("journal is diagnostic-only and returned events cannot mutate actor state", async () => {
  let now = 1;
  const lifecycle = new WebTurnLifecycleCoordinator({ now: () => now++ });
  await lifecycle.submissionSent();
  const journal = lifecycle.events();
  const first = journal[0]!;
  (first.event as { type: string }).type = "cancel";
  expect(lifecycle.snapshot().phase).toBe("submitted");
  expect(lifecycle.events()[0]!.event.type).toBe("prepare");
});
