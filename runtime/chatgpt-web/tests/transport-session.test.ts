import { expect, test } from "bun:test";
import {
  classifyTransportFailure,
  createTransportSessionState,
  reduceTransportSession,
  type TransportObservation,
  type TransportSessionState,
} from "../src/core/transport/transport-session";

function apply(state: TransportSessionState, observation: TransportObservation): TransportSessionState {
  return reduceTransportSession(state, observation);
}

test("transport session keeps request evidence isolated per request", () => {
  let state = createTransportSessionState();
  state = apply(state, {
    type: "request_sent", at: 1, source: "cdp", requestId: "primary",
    url: "https://chatgpt.com/backend-api/conversation", method: "POST", role: "candidate",
  });
  state = apply(state, {
    type: "response_received", at: 2, source: "cdp", requestId: "primary", status: 200,
  });
  state = apply(state, {
    type: "data_received", at: 3, source: "cdp", requestId: "primary", bytes: 395_790,
  });
  state = apply(state, {
    type: "request_sent", at: 4, source: "cdp", requestId: "aux",
    url: "https://chatgpt.com/backend-api/other", method: "GET", role: "auxiliary",
  });
  state = apply(state, {
    type: "response_received", at: 5, source: "cdp", requestId: "aux", status: 404,
  });

  expect(state.primaryRequestId).toBe("primary");
  expect(state.requests.primary?.responseStatus).toBe(200);
  expect(state.requests.primary?.bytesReceived).toBe(395_790);
  expect(state.requests.aux?.responseStatus).toBe(404);
});

test("post-response ERR_ABORTED with data is benign request-local evidence", () => {
  let state = createTransportSessionState();
  state = apply(state, {
    type: "request_sent", at: 1, source: "cdp", requestId: "r1",
    url: "https://chatgpt.com/backend-api/conversation", method: "POST", role: "candidate",
  });
  state = apply(state, {
    type: "response_received", at: 2, source: "cdp", requestId: "r1", status: 200,
  });
  state = apply(state, {
    type: "data_received", at: 3, source: "cdp", requestId: "r1", bytes: 10,
  });
  state = apply(state, {
    type: "request_failed", at: 4, source: "cdp", requestId: "r1", errorText: "net::ERR_ABORTED",
  });
  expect(classifyTransportFailure(state.requests.r1!)).toBe("benign");
  expect(state.primaryRequestId).toBe("r1");
});

test("pre-response failure yields to a later accepted candidate", () => {
  let state = createTransportSessionState();
  state = apply(state, {
    type: "request_sent", at: 1, source: "cdp", requestId: "r1",
    url: "https://chatgpt.com/backend-api/conversation", method: "POST", role: "candidate",
  });
  state = apply(state, {
    type: "request_failed", at: 2, source: "cdp", requestId: "r1", errorText: "net::ERR_CONNECTION_RESET",
  });
  expect(classifyTransportFailure(state.requests.r1!)).toBe("recoverable");

  state = apply(state, {
    type: "request_sent", at: 3, source: "cdp", requestId: "r2",
    url: "https://chatgpt.com/backend-api/conversation", method: "POST", role: "candidate",
  });
  state = apply(state, {
    type: "response_received", at: 4, source: "cdp", requestId: "r2", status: 200,
  });
  expect(state.primaryRequestId).toBe("r2");
});

test("duplicate evidence keys are idempotent and do not double-count chunks", () => {
  let state = createTransportSessionState();
  state = apply(state, {
    type: "request_sent", at: 1, source: "cdp", requestId: "r1",
    url: "https://chatgpt.com/backend-api/conversation", method: "POST", role: "candidate",
    evidenceKey: "sent:1",
  });
  state = apply(state, {
    type: "response_received", at: 2, source: "cdp", requestId: "r1", status: 200,
    evidenceKey: "response:1",
  });
  state = apply(state, {
    type: "data_received", at: 3, source: "cdp", requestId: "r1", bytes: 50,
    evidenceKey: "data:1",
  });
  const revision = state.revision;
  state = apply(state, {
    type: "data_received", at: 3, source: "playwright", requestId: "r1", bytes: 50,
    evidenceKey: "data:1",
  });
  expect(state.revision).toBe(revision);
  expect(state.requests.r1?.chunksReceived).toBe(1);
  expect(state.requests.r1?.bytesReceived).toBe(50);
});

test("redirect status can be replaced before payload starts, conflicting final statuses cannot", () => {
  let state = createTransportSessionState();
  state = apply(state, {
    type: "request_sent", at: 1, source: "cdp", requestId: "r1",
    url: "https://chatgpt.com/backend-api/conversation", method: "POST", role: "candidate",
  });
  state = apply(state, {
    type: "response_received", at: 2, source: "cdp", requestId: "r1", status: 307,
  });
  state = apply(state, {
    type: "response_received", at: 3, source: "cdp", requestId: "r1", status: 200,
  });
  expect(state.requests.r1?.responseStatus).toBe(200);
  expect(() => apply(state, {
    type: "response_received", at: 4, source: "playwright", requestId: "r1", status: 404,
  })).toThrow("conflicting");
});
