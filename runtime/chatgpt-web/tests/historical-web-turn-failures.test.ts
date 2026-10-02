import { expect, test } from "bun:test";
import {
  classifyTransportFailure,
  createTransportSessionState,
  reduceTransportSession,
} from "../src/core/transport/transport-session";
import { decideMissingAssistant } from "../src/adapters/chatgpt-web/turn-lifecycle-policy";
import { ChatGptDomLifecycleAdapter } from "../src/adapters/chatgpt-web/dom-lifecycle-adapter";
import { BoundedRecoveryBudget } from "../src/core/resilience/recovery-budget";
import type { TurnLifecycleSink } from "../src/ports/turn-lifecycle";
import type { TurnState } from "../src/core/turn/turn-state-machine";

test("historical: accepted transport survives missing assistant DOM while network progresses", () => {
  const network = {
    revision: 3,
    cdpAttached: true,
    requestSeen: true,
    responseSeen: true,
    responseStatus: 200,
    streamActive: true,
    completed: false,
    failed: false,
    abortedAfterResponse: false,
    requestAt: 1,
    responseAt: 2,
    lastActivityAt: 9_950,
    dataChunks: 3,
    dataBytes: 2048,
    primaryRequestId: "r1",
    requestCount: 1,
  } as const;
  expect(decideMissingAssistant({
    now: 10_000,
    responseDeadline: 9_000,
    network,
    networkLive: true,
    externalProgressLive: false,
    networkDomSettleMs: 5_000,
    abortedStreamDomSettleMs: 20_000,
  })).toEqual({ kind: "wait", reason: "transport_live" });
});

test("historical: surface rebind during active stream is a DOM revision, not a turn failure", async () => {
  const events: unknown[] = [];
  const sink: TurnLifecycleSink = {
    phase: () => "streaming",
    dispatch: async (_source, event) => {
      events.push(event);
      return { phase: "streaming" } as TurnState;
    },
  };
  const dom = new ChatGptDomLifecycleAdapter(sink);
  await dom.observe({ at: 1, observerKey: "doc-a:1:4", responsePresent: true, identity: "assistant-1" });
  await dom.observe({ at: 2, responsePresent: false, identity: "assistant-1" });
  await dom.observe({ at: 3, observerKey: "doc-b:1:0", responsePresent: true, identity: "assistant-1" });
  expect(dom.snapshot().revision).toBe(3);
  expect(events).toHaveLength(3);
});

test("historical: 200 plus data plus ERR_ABORTED remains benign request-local evidence", () => {
  let state = createTransportSessionState();
  state = reduceTransportSession(state, {
    type: "request_sent", source: "cdp", at: 1, requestId: "r1",
    url: "https://chatgpt.com/backend-api/conversation", method: "POST", role: "candidate",
  });
  state = reduceTransportSession(state, {
    type: "response_received", source: "cdp", at: 2, requestId: "r1", status: 200,
  });
  state = reduceTransportSession(state, {
    type: "data_received", source: "cdp", at: 3, requestId: "r1", bytes: 395_790,
  });
  state = reduceTransportSession(state, {
    type: "request_failed", source: "cdp", at: 4, requestId: "r1", errorText: "net::ERR_ABORTED",
  });
  expect(classifyTransportFailure(state.requests.r1!)).toBe("benign");
});

test("historical: auxiliary 404 never replaces a valid primary request", () => {
  let state = createTransportSessionState();
  state = reduceTransportSession(state, {
    type: "request_sent", source: "cdp", at: 1, requestId: "primary",
    url: "https://chatgpt.com/backend-api/conversation", method: "POST", role: "candidate",
  });
  state = reduceTransportSession(state, {
    type: "response_received", source: "cdp", at: 2, requestId: "primary", status: 200,
  });
  state = reduceTransportSession(state, {
    type: "data_received", source: "cdp", at: 3, requestId: "primary", bytes: 512,
  });
  state = reduceTransportSession(state, {
    type: "request_sent", source: "cdp", at: 4, requestId: "aux",
    url: "https://chatgpt.com/backend-api/other", method: "GET", role: "auxiliary",
  });
  state = reduceTransportSession(state, {
    type: "response_received", source: "cdp", at: 5, requestId: "aux", status: 404,
  });
  expect(state.primaryRequestId).toBe("primary");
  expect(state.requests.primary?.responseStatus).toBe(200);
});

test("historical: browser observation timeout recovery is bounded", () => {
  const budget = new BoundedRecoveryBudget("assistant-dom-observation", 2);
  expect(budget.consume(new Error("timeout-1"))).toBe(1);
  expect(budget.consume(new Error("timeout-2"))).toBe(2);
  expect(() => budget.consume(new Error("timeout-3"))).toThrow("exhausted after 2 attempts");
});

test("historical: genuine pre-response transport failure is not classified benign", () => {
  let state = createTransportSessionState();
  state = reduceTransportSession(state, {
    type: "request_sent", source: "cdp", at: 1, requestId: "r1",
    url: "https://chatgpt.com/backend-api/conversation", method: "POST", role: "candidate",
  });
  state = reduceTransportSession(state, {
    type: "request_failed", source: "cdp", at: 2, requestId: "r1", errorText: "net::ERR_CONNECTION_RESET",
  });
  expect(classifyTransportFailure(state.requests.r1!)).toBe("recoverable");
});
