import { expect, test } from "bun:test";
import { ChatGptDomLifecycleAdapter } from "../src/adapters/chatgpt-web/dom-lifecycle-adapter";
import type { TurnLifecycleSink } from "../src/ports/turn-lifecycle";
import type { TurnEvent, TurnState } from "../src/core/turn/turn-state-machine";

test("DOM lifecycle adapter emits monotonic revisions only for actual observer/surface changes", async () => {
  const events: TurnEvent[] = [];
  const sink: TurnLifecycleSink = {
    phase: () => "streaming",
    dispatch: async (_source, event) => {
      events.push(event);
      return {} as TurnState;
    },
  };
  const adapter = new ChatGptDomLifecycleAdapter(sink);

  expect(await adapter.observe({
    at: 1,
    observerKey: "doc:1:0",
    responsePresent: true,
    identity: "assistant-1",
  })).toBeTrue();
  expect(await adapter.observe({
    at: 2,
    observerKey: "doc:1:0",
    responsePresent: true,
    identity: "assistant-1",
  })).toBeFalse();
  expect(await adapter.observe({
    at: 3,
    observerKey: "doc:1:1",
    responsePresent: true,
    identity: "assistant-1",
  })).toBeTrue();

  expect(events).toEqual([
    { type: "dom_revision", at: 1, revision: 1 },
    { type: "dom_revision", at: 3, revision: 2 },
  ]);
});

test("surface loss and remount are observations, not implicit turn failures", async () => {
  const events: TurnEvent[] = [];
  const sink: TurnLifecycleSink = {
    phase: () => "streaming",
    dispatch: async (_source, event) => {
      events.push(event);
      return {} as TurnState;
    },
  };
  const adapter = new ChatGptDomLifecycleAdapter(sink);

  await adapter.observe({
    at: 1,
    observerKey: "doc:1:4",
    responsePresent: true,
    identity: "assistant-1",
  });
  await adapter.observe({
    at: 2,
    responsePresent: false,
    identity: "assistant-1",
  });
  await adapter.observe({
    at: 3,
    observerKey: "doc:2:0",
    responsePresent: true,
    identity: "assistant-1",
  });

  expect(adapter.snapshot()).toEqual({
    revision: 3,
    responsePresent: true,
    observerKey: "doc:2:0",
    identity: "assistant-1",
  });
  expect(events.map(event => event.type)).toEqual(["dom_revision", "dom_revision", "dom_revision"]);
});
