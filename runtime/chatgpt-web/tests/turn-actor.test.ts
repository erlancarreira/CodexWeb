import { expect, test } from "bun:test";
import {
  TurnActor,
  TurnActorClosedError,
  TurnMailboxOverflowError,
} from "../src/core/turn/turn-actor";
import type { SequencedTurnEvent } from "../src/core/turn/turn-state-machine";

test("turn actor serializes concurrent producers through one writer", async () => {
  const seen: SequencedTurnEvent[] = [];
  const actor = new TurnActor({
    onTransition: async (_state, event) => {
      seen.push(event);
      await Promise.resolve();
    },
  });

  await actor.dispatch("runtime", { type: "prepare", at: 1 });
  await actor.dispatch("runtime", { type: "submission_sent", at: 2 });
  await actor.dispatch("transport", { type: "transport_accepted", at: 3, requestId: "r1", status: 200 });

  const results = await Promise.all([
    actor.dispatch("transport", { type: "transport_data", at: 4, requestId: "r1", bytes: 1 }),
    actor.dispatch("dom", { type: "dom_revision", at: 5, revision: 1 }),
    actor.dispatch("dom", { type: "dom_revision", at: 6, revision: 2 }),
  ]);

  expect(results.at(-1)?.sequence).toBe(5);
  expect(actor.snapshot().sequence).toBe(5);
  expect(seen.map(event => event.sequence)).toEqual([1, 2, 3, 4, 5]);
});

test("pending DOM revisions coalesce to the newest revision", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const transitions: SequencedTurnEvent[] = [];
  const actor = new TurnActor({
    onTransition: async (_state, event) => {
      transitions.push(event);
      if (event.event.type === "transport_data") await gate;
    },
  });

  await actor.dispatch("runtime", { type: "prepare", at: 1 });
  await actor.dispatch("runtime", { type: "submission_sent", at: 2 });
  await actor.dispatch("transport", { type: "transport_accepted", at: 3, requestId: "r1", status: 200 });

  const data = actor.dispatch("transport", { type: "transport_data", at: 4, requestId: "r1", bytes: 1 });
  await Promise.resolve();
  const dom1 = actor.dispatch("dom", { type: "dom_revision", at: 5, revision: 10 });
  const dom2 = actor.dispatch("dom", { type: "dom_revision", at: 6, revision: 11 });
  const dom3 = actor.dispatch("dom", { type: "dom_revision", at: 7, revision: 9 });

  release();
  await data;
  const [one, two, three] = await Promise.all([dom1, dom2, dom3]);
  expect(one.lastDomRevision).toBe(11);
  expect(two.lastDomRevision).toBe(11);
  expect(three.lastDomRevision).toBe(11);
  expect(transitions.filter(event => event.event.type === "dom_revision")).toHaveLength(1);
});

test("DOM coalescing never crosses a critical event boundary", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const seen: SequencedTurnEvent[] = [];
  const actor = new TurnActor({
    onTransition: async (_state, event) => {
      seen.push(event);
      if (event.event.type === "transport_data" && event.event.at === 4) await gate;
    },
  });

  await actor.dispatch("runtime", { type: "prepare", at: 1 });
  await actor.dispatch("runtime", { type: "submission_sent", at: 2 });
  await actor.dispatch("transport", { type: "transport_accepted", at: 3, requestId: "r1", status: 200 });

  const blocked = actor.dispatch("transport", { type: "transport_data", at: 4, requestId: "r1", bytes: 1 });
  await Promise.resolve();
  const domBefore = actor.dispatch("dom", { type: "dom_revision", at: 5, revision: 10 });
  const critical = actor.dispatch("transport", { type: "transport_data", at: 6, requestId: "r1", bytes: 1 });
  const domAfter = actor.dispatch("dom", { type: "dom_revision", at: 7, revision: 11 });

  release();
  await Promise.all([blocked, domBefore, critical, domAfter]);

  const tail = seen.slice(-3).map(entry => entry.event.type);
  expect(tail).toEqual(["dom_revision", "transport_data", "dom_revision"]);
  expect(seen.filter(entry => entry.event.type === "dom_revision")).toHaveLength(2);
  expect(actor.snapshot().lastDomRevision).toBe(11);
});

test("critical events can evict replaceable DOM pressure but are not silently dropped", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const actor = new TurnActor({
    maxQueueSize: 8,
    onTransition: async (_state, event) => {
      if (event.event.type === "transport_data") await gate;
    },
  });

  await actor.dispatch("runtime", { type: "prepare", at: 1 });
  await actor.dispatch("runtime", { type: "submission_sent", at: 2 });
  await actor.dispatch("transport", { type: "transport_accepted", at: 3, requestId: "r1", status: 200 });
  const data = actor.dispatch("transport", { type: "transport_data", at: 4, requestId: "r1", bytes: 1 });
  await Promise.resolve();

  const dom = actor.dispatch("dom", { type: "dom_revision", at: 5, revision: 1 });
  const queued = Array.from({ length: 7 }, (_, index) => actor.dispatch("transport", {
    type: "transport_data" as const,
    at: 6 + index,
    requestId: "r1",
    bytes: 1,
  }));
  const critical = actor.dispatch("transport", {
    type: "transport_failed",
    at: 20,
    requestId: "r1",
    classification: "benign",
    reason: "net::ERR_ABORTED",
  });

  release();
  await data;
  await Promise.allSettled([dom, ...queued, critical]);
  await expect(dom).rejects.toBeInstanceOf(TurnMailboxOverflowError);
  await expect(critical).resolves.toMatchObject({ lastTransportFailure: { classification: "benign" } });
});

test("terminal state closes the actor and rejects later work", async () => {
  const actor = new TurnActor();
  await actor.dispatch("client", { type: "cancel", at: 1, reason: "user" });
  expect(actor.snapshot().phase).toBe("cancelled");
  await expect(actor.dispatch("dom", { type: "dom_revision", at: 2, revision: 1 }))
    .rejects.toBeInstanceOf(TurnActorClosedError);
});
