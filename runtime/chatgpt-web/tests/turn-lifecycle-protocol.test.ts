import { expect, test } from "bun:test";
import {
  parseTurnLifecycleState,
  parseTurnLifecycleWireEvent,
} from "../src/adapters/chatgpt-web/turn-lifecycle-protocol";
import { createTurnState } from "../src/core/turn/turn-state-machine";

test("turn lifecycle wire protocol accepts typed transport and tool events", () => {
  expect(parseTurnLifecycleWireEvent({
    source: "transport",
    event: { type: "transport_accepted", at: 10, requestId: "r1", status: 200 },
  })).toEqual({
    source: "transport",
    event: { type: "transport_accepted", at: 10, requestId: "r1", status: 200 },
  });
  expect(parseTurnLifecycleWireEvent({
    source: "tool",
    event: { type: "tool_requested", at: 11, callIds: ["call_1", "call_2"] },
  }).event.type).toBe("tool_requested");
});

test("turn lifecycle wire protocol rejects malformed events", () => {
  expect(() => parseTurnLifecycleWireEvent({
    source: "transport",
    event: { type: "transport_data", at: 1, requestId: "", bytes: 0 },
  })).toThrow();
  expect(() => parseTurnLifecycleWireEvent({
    source: "unknown",
    event: { type: "prepare", at: 1 },
  })).toThrow();
});

test("turn lifecycle state parser validates actor snapshots", () => {
  expect(parseTurnLifecycleState(createTurnState())).toEqual(createTurnState());
  expect(() => parseTurnLifecycleState({
    ...createTurnState(),
    phase: "imaginary",
  })).toThrow("phase");
});
