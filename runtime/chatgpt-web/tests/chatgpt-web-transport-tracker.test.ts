import { expect, test } from "bun:test";
import { ChatGptWebTransportTracker } from "../src/adapters/chatgpt-web/transport-tracker";

test("CDP is authoritative when attached and Playwright does not double-count", () => {
  const tracker = new ChatGptWebTransportTracker();
  tracker.setCdpAttached(true);

  expect(tracker.record({
    type: "request_sent", at: 1, source: "playwright", requestId: "pw:1",
    url: "https://chatgpt.com/backend-api/conversation", method: "POST", role: "candidate",
  })).toBeFalse();

  expect(tracker.record({
    type: "request_sent", at: 2, source: "cdp", requestId: "cdp:1",
    url: "https://chatgpt.com/backend-api/conversation", method: "POST", role: "candidate",
  })).toBeTrue();
  tracker.record({ type: "response_received", at: 3, source: "cdp", requestId: "cdp:1", status: 200 });
  tracker.record({ type: "data_received", at: 4, source: "cdp", requestId: "cdp:1", bytes: 100 });

  const snapshot = tracker.networkSnapshot();
  expect(snapshot.primaryRequestId).toBe("cdp:1");
  expect(snapshot.requestCount).toBe(1);
  expect(snapshot.dataChunks).toBe(1);
  expect(snapshot.dataBytes).toBe(100);
});

test("Playwright remains the fallback when CDP is unavailable", () => {
  const tracker = new ChatGptWebTransportTracker();
  tracker.record({
    type: "request_sent", at: 1, source: "playwright", requestId: "pw:1",
    url: "https://chatgpt.com/backend-api/conversation", method: "POST", role: "candidate",
  });
  tracker.record({ type: "response_received", at: 2, source: "playwright", requestId: "pw:1", status: 200 });
  tracker.record({ type: "request_finished", at: 3, source: "playwright", requestId: "pw:1" });

  expect(tracker.networkSnapshot()).toMatchObject({
    cdpAttached: false,
    requestSeen: true,
    responseSeen: true,
    responseStatus: 200,
    completed: true,
    failed: false,
    primaryRequestId: "pw:1",
  });
});

test("auxiliary 404 cannot replace a valid primary response", () => {
  const tracker = new ChatGptWebTransportTracker();
  tracker.setCdpAttached(true);
  tracker.record({
    type: "request_sent", at: 1, source: "cdp", requestId: "primary",
    url: "https://chatgpt.com/backend-api/conversation", method: "POST", role: "candidate",
  });
  tracker.record({ type: "response_received", at: 2, source: "cdp", requestId: "primary", status: 200 });
  tracker.record({ type: "data_received", at: 3, source: "cdp", requestId: "primary", bytes: 10 });
  tracker.record({
    type: "request_sent", at: 4, source: "cdp", requestId: "aux",
    url: "https://chatgpt.com/backend-api/unrelated", method: "GET", role: "auxiliary",
  });
  tracker.record({ type: "response_received", at: 5, source: "cdp", requestId: "aux", status: 404 });

  expect(tracker.networkSnapshot()).toMatchObject({
    primaryRequestId: "primary",
    responseStatus: 200,
    dataBytes: 10,
  });
});

test("post-response ERR_ABORTED is non-fatal only with accepted response and data", () => {
  const tracker = new ChatGptWebTransportTracker();
  tracker.setCdpAttached(true);
  tracker.record({
    type: "request_sent", at: 1, source: "cdp", requestId: "r1",
    url: "https://chatgpt.com/backend-api/conversation", method: "POST", role: "candidate",
  });
  tracker.record({ type: "response_received", at: 2, source: "cdp", requestId: "r1", status: 200 });
  tracker.record({ type: "data_received", at: 3, source: "cdp", requestId: "r1", bytes: 1 });
  tracker.record({ type: "request_failed", at: 4, source: "cdp", requestId: "r1", errorText: "net::ERR_ABORTED" });

  expect(tracker.networkSnapshot()).toMatchObject({
    failed: false,
    abortedAfterResponse: true,
    abortText: "net::ERR_ABORTED",
    dataChunks: 1,
  });

  const beforeResponse = new ChatGptWebTransportTracker();
  beforeResponse.setCdpAttached(true);
  beforeResponse.record({
    type: "request_sent", at: 1, source: "cdp", requestId: "r2",
    url: "https://chatgpt.com/backend-api/conversation", method: "POST", role: "candidate",
  });
  beforeResponse.record({
    type: "request_failed", at: 2, source: "cdp", requestId: "r2", errorText: "net::ERR_ABORTED",
  });
  expect(beforeResponse.networkSnapshot().failed).toBeTrue();
});
