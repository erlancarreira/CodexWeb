import { expect, test } from "bun:test";
import { WebTurnLifecycleCoordinator } from "../src/application/web-turn-lifecycle-coordinator";
import { WebTurnToolLifecycle } from "../src/application/web-turn-tool-lifecycle";
import { WebTurnSupervisor } from "../src/application/web-turn-supervisor";
import { ChatGptDomLifecycleAdapter } from "../src/adapters/chatgpt-web/dom-lifecycle-adapter";
import { ChatGptCompactionProjection } from "../src/adapters/chatgpt-web/compaction-projection";
import { CompactionLifecycleCoordinator } from "../src/application/compaction-lifecycle-coordinator";
import type { ChatGptMarkdownSegment } from "../src/adapters/chatgpt-web/markdown";

async function streamingTurn(traceId = "trace-fi", turnId = "turn-fi") {
  const lifecycle = new WebTurnLifecycleCoordinator({ traceId, turnId, now: () => 0 });
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
    bytes: 64,
  });
  return lifecycle;
}

test("fault injection: DOM disappears and remounts while network-active turn survives", async () => {
  const lifecycle = await streamingTurn();
  const dom = new ChatGptDomLifecycleAdapter(lifecycle);

  await dom.observe({ at: 4, observerKey: "doc-a:1:4", responsePresent: true, identity: "assistant-1" });
  await dom.observe({ at: 5, responsePresent: false, identity: "assistant-1" });
  expect(lifecycle.phase()).toBe("streaming");

  await lifecycle.dispatch("transport", {
    type: "transport_data",
    at: 6,
    requestId: "request-1",
    bytes: 32,
  });
  await dom.observe({ at: 7, observerKey: "doc-b:1:0", responsePresent: true, identity: "assistant-1" });

  expect(lifecycle.phase()).toBe("streaming");
  expect(dom.snapshot()).toMatchObject({ revision: 3, responsePresent: true });
});

test("fault injection: stalled tool is terminated only by named turn deadline", async () => {
  const lifecycle = await streamingTurn();
  const tools = new WebTurnToolLifecycle(lifecycle);
  await tools.requestBatch(["call-1"], 4);
  await tools.started("call-1", 5);
  expect(lifecycle.phase()).toBe("tool_running");

  await lifecycle.deadlineExceeded(10_000, 10_000);
  expect(lifecycle.snapshot()).toMatchObject({
    phase: "timed_out",
    terminal: { reason: "deadline_exceeded:10000" },
  });
});

test("fault injection: tool completion after DOM remount returns to streaming", async () => {
  const lifecycle = await streamingTurn();
  const tools = new WebTurnToolLifecycle(lifecycle);
  const dom = new ChatGptDomLifecycleAdapter(lifecycle);

  await tools.requestBatch(["call-1"], 4);
  await tools.started("call-1", 5);
  await dom.observe({ at: 6, observerKey: "doc-a:1:1", responsePresent: true, identity: "assistant-1" });
  await dom.observe({ at: 7, responsePresent: false, identity: "assistant-1" });
  await dom.observe({ at: 8, observerKey: "doc-b:1:0", responsePresent: true, identity: "assistant-1" });
  await tools.completed("call-1", 9);

  expect(lifecycle.phase()).toBe("streaming");
  expect(lifecycle.snapshot().activeToolCalls).toEqual([]);
});

test("fault injection: tunnel reconnect replay of the same tool batch is idempotent", async () => {
  const lifecycle = await streamingTurn();
  const tools = new WebTurnToolLifecycle(lifecycle);

  await tools.requestBatch(["call-a", "call-b"], 4);
  // Models the broker replay after the tunnel reconnects: same turn, same call ids, no new state.
  await tools.requestBatch(["call-b", "call-a"], 5);
  expect(lifecycle.snapshot().activeToolCalls).toEqual(["call-a", "call-b"]);
  expect(lifecycle.phase()).toBe("waiting_tool");
});

test("fault injection: Codex cancellation stops one turn without corrupting another", async () => {
  const supervisor = new WebTurnSupervisor({ maxActiveTurns: 2 });
  const first = supervisor.acquire("turn-a", { traceId: "trace-a", turnId: "turn-a", now: () => 0 });
  const second = supervisor.acquire("turn-b", { traceId: "trace-b", turnId: "turn-b", now: () => 0 });
  await first.submissionSent(1);
  await second.submissionSent(1);

  await supervisor.cancel("turn-a", "client cancelled");
  expect(first.phase()).toBe("cancelled");
  expect(second.phase()).toBe("submitted");
});

test("fault injection: two simultaneous turns keep independent sequence and request identity", async () => {
  const supervisor = new WebTurnSupervisor({ maxActiveTurns: 2 });
  const a = supervisor.acquire("a", { traceId: "a", turnId: "a", now: () => 0 });
  const b = supervisor.acquire("b", { traceId: "b", turnId: "b", now: () => 0 });
  await Promise.all([a.submissionSent(1), b.submissionSent(1)]);
  await Promise.all([
    a.dispatch("transport", { type: "transport_accepted", at: 2, requestId: "ra", status: 200 }),
    b.dispatch("transport", { type: "transport_accepted", at: 2, requestId: "rb", status: 200 }),
  ]);

  expect(a.snapshot()).toMatchObject({ sequence: 3, primaryRequestId: "ra" });
  expect(b.snapshot()).toMatchObject({ sequence: 3, primaryRequestId: "rb" });
});

test("fault injection: compaction renderer rewrite and remount serialize only the final projection", () => {
  const projection = new ChatGptCompactionProjection();
  const provisional: ChatGptMarkdownSegment[] = [{
    key: "summary",
    tag: "p",
    text: "Provisional",
    html: "<p>Provisional</p>",
    sourceStart: 0,
    sourceEnd: 11,
    streamable: true,
  }];
  const rewritten: ChatGptMarkdownSegment[] = [{
    ...provisional[0]!,
    text: "Rewritten provisional",
    html: "<p>Rewritten provisional</p>",
    sourceEnd: 21,
  }];
  const final: ChatGptMarkdownSegment[] = [{
    key: "final",
    tag: "p",
    text: "Final checkpoint",
    html: "<p>Final checkpoint</p>",
    sourceStart: 0,
    sourceEnd: 16,
    streamable: true,
  }];

  expect(projection.observe(provisional)).toBe("");
  expect(projection.observe(rewritten)).toBe("");
  projection.remount();
  expect(projection.observe(final)).toBe("");
  expect(projection.finish()).toEqual({ markdown: "Final checkpoint", delta: "Final checkpoint" });
});

test("fault injection: replacement cancels compaction before a late handoff can complete it", async () => {
  const lifecycle = new CompactionLifecycleCoordinator({ now: () => 0 });
  await lifecycle.settleSource(1);
  await lifecycle.waitHandoff("handoff-1", 2);
  await lifecycle.cancel("replacement turn won ownership", 3);

  expect(lifecycle.snapshot().phase).toBe("cancelled");
  await expect(lifecycle.handoffReceived(4)).rejects.toThrow("Invalid compaction transition");
});
