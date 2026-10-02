import { expect, test } from "bun:test";
import { WebTurnLifecycleCoordinator } from "../src/application/web-turn-lifecycle-coordinator";
import { redactTurnDiagnosticText } from "../src/core/observability/redaction";

test("lifecycle diagnostic trace carries identity, request and causal terminal metadata", async () => {
  const lifecycle = new WebTurnLifecycleCoordinator({
    traceId: "trace-1",
    turnId: "turn-1",
    now: () => 0,
  });
  await lifecycle.submissionSent(1);
  await lifecycle.dispatch("transport", {
    type: "transport_accepted",
    at: 2,
    requestId: "request-1",
    status: 200,
  });
  await lifecycle.dispatch("transport", {
    type: "transport_data",
    at: 3,
    requestId: "request-1",
    bytes: 128,
  });
  await lifecycle.dispatch("runtime", {
    type: "fail",
    at: 4,
    reason: "Bearer super-secret-token-123456789",
  });

  const diagnostic = lifecycle.diagnosticSnapshot();
  expect(diagnostic.state.phase).toBe("failed");
  expect(diagnostic.terminal?.reason).toBe("Bearer [redacted]");
  expect(diagnostic.events.map(event => ({
    traceId: event.traceId,
    turnId: event.turnId,
    requestId: event.requestId,
    source: event.source,
    sequence: event.sequence,
    timestamp: event.timestamp,
    type: event.type,
  }))).toEqual([
    { traceId: "trace-1", turnId: "turn-1", requestId: undefined, source: "runtime", sequence: 1, timestamp: 0, type: "prepare" },
    { traceId: "trace-1", turnId: "turn-1", requestId: undefined, source: "runtime", sequence: 2, timestamp: 1, type: "submission_sent" },
    { traceId: "trace-1", turnId: "turn-1", requestId: "request-1", source: "transport", sequence: 3, timestamp: 2, type: "transport_accepted" },
    { traceId: "trace-1", turnId: "turn-1", requestId: "request-1", source: "transport", sequence: 4, timestamp: 3, type: "transport_data" },
    { traceId: "trace-1", turnId: "turn-1", requestId: undefined, source: "runtime", sequence: 5, timestamp: 4, type: "fail" },
  ]);
});

test("diagnostic redaction strips common credential forms", () => {
  expect(redactTurnDiagnosticText("sk-proj_12345678901234567890")).toBe("[redacted-key]");
  expect(redactTurnDiagnosticText("api_key=secret-value")).toBe("api_key=[redacted]");
});
