import { expect, test } from "bun:test";
import { decideMissingAssistant } from "../src/adapters/chatgpt-web/turn-lifecycle-policy";
import type { ChatGptWebTransportSnapshot } from "../src/adapters/chatgpt-web/transport-tracker";

function network(
  patch: Partial<ChatGptWebTransportSnapshot> = {},
): ChatGptWebTransportSnapshot {
  return {
    revision: 0,
    cdpAttached: true,
    requestSeen: true,
    responseSeen: false,
    streamActive: false,
    completed: false,
    failed: false,
    abortedAfterResponse: false,
    dataChunks: 0,
    dataBytes: 0,
    requestCount: 1,
    ...patch,
  };
}

const base = {
  now: 10_000,
  responseDeadline: 9_000,
  networkLive: false,
  externalProgressLive: false,
  networkDomSettleMs: 5_000,
  abortedStreamDomSettleMs: 20_000,
};

test("live transport wins over an expired DOM grace window", () => {
  expect(decideMissingAssistant({
    ...base,
    network: network({ streamActive: true, lastActivityAt: 9_900 }),
    networkLive: true,
  })).toEqual({ kind: "wait", reason: "transport_live" });
});

test("completed 2xx transport gets a bounded renderer settle window", () => {
  expect(decideMissingAssistant({
    ...base,
    now: 12_000,
    network: network({
      responseSeen: true,
      responseStatus: 200,
      completed: true,
      completedAt: 10_000,
    }),
  })).toEqual({ kind: "wait", reason: "network_dom_settle", until: 15_000 });

  expect(decideMissingAssistant({
    ...base,
    now: 15_000,
    network: network({
      responseSeen: true,
      responseStatus: 200,
      completed: true,
      completedAt: 10_000,
    }),
  })).toEqual({ kind: "recover", reason: "assistant_dom_missing" });
});

test("completed transport respects a refreshed DOM recovery deadline", () => {
  expect(decideMissingAssistant({
    ...base,
    now: 16_000,
    responseDeadline: 20_000,
    network: network({
      responseSeen: true,
      responseStatus: 200,
      completed: true,
      completedAt: 10_000,
    }),
  })).toEqual({ kind: "wait", reason: "network_dom_settle", until: 20_000 });

  expect(decideMissingAssistant({
    ...base,
    now: 20_000,
    responseDeadline: 20_000,
    network: network({
      responseSeen: true,
      responseStatus: 200,
      completed: true,
      completedAt: 10_000,
    }),
  })).toEqual({ kind: "recover", reason: "assistant_dom_missing" });
});

test("benign post-response abort receives the longer renderer settle window", () => {
  expect(decideMissingAssistant({
    ...base,
    now: 25_000,
    network: network({
      responseSeen: true,
      responseStatus: 200,
      completed: true,
      completedAt: 10_000,
      abortedAfterResponse: true,
      abortText: "net::ERR_ABORTED",
    }),
  })).toEqual({ kind: "wait", reason: "network_dom_settle", until: 30_000 });
});

test("real network failure is terminal for the current observation", () => {
  expect(decideMissingAssistant({
    ...base,
    network: network({ failed: true, failureText: "net::ERR_CONNECTION_RESET" }),
  })).toMatchObject({
    kind: "fail",
    code: "browser_stream_failed",
    status: 502,
    retryable: true,
  });
});

test("stalled CDP transport and ordinary missing DOM are distinct decisions", () => {
  expect(decideMissingAssistant({
    ...base,
    network: network({ responseSeen: true, responseStatus: 200 }),
  })).toMatchObject({ kind: "fail", code: "browser_stream_stalled", status: 504 });

  expect(decideMissingAssistant({
    ...base,
    network: network({ cdpAttached: false, requestSeen: false }),
  })).toEqual({ kind: "recover", reason: "assistant_dom_missing" });
});
