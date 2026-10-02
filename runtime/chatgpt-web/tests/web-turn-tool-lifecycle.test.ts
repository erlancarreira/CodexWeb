import { expect, test } from "bun:test";
import { WebTurnLifecycleCoordinator } from "../src/application/web-turn-lifecycle-coordinator";
import { WebTurnToolLifecycle } from "../src/application/web-turn-tool-lifecycle";

async function activeTurn() {
  const lifecycle = new WebTurnLifecycleCoordinator({ now: () => 0 });
  await lifecycle.submissionSent(1);
  await lifecycle.dispatch("transport", {
    type: "transport_accepted",
    at: 2,
    requestId: "r1",
    status: 200,
  });
  return lifecycle;
}

test("tool lifecycle owns requested, started and completed transitions", async () => {
  const lifecycle = await activeTurn();
  const tools = new WebTurnToolLifecycle(lifecycle);
  await tools.requestBatch(["a", "b"], 3);
  await tools.started("a", 4);
  expect(lifecycle.phase()).toBe("tool_running");
  await tools.completed("a", 5);
  expect(lifecycle.snapshot().activeToolCalls).toEqual(["b"]);
  await tools.started("b", 6);
  await tools.completed("b", 7);
  expect(lifecycle.phase()).toBe("streaming");
});

test("same-batch reconnect is idempotent and foreign batch is rejected", async () => {
  const lifecycle = await activeTurn();
  const tools = new WebTurnToolLifecycle(lifecycle);
  await tools.requestBatch(["a", "b"], 3);
  await tools.requestBatch(["b", "a"], 4);
  expect(lifecycle.snapshot().activeToolCalls).toEqual(["a", "b"]);
  await expect(tools.requestBatch(["foreign"], 5)).rejects.toThrow("does not match the actor-owned turn");
});

test("late tool completion after turn cancellation cannot mutate the terminal turn", async () => {
  const lifecycle = await activeTurn();
  const tools = new WebTurnToolLifecycle(lifecycle);
  await tools.requestBatch(["a"], 3);
  await tools.started("a", 4);
  await lifecycle.cancel("operator", 5);
  await expect(tools.completed("a", 6)).rejects.toThrow();
  expect(lifecycle.phase()).toBe("cancelled");
});

test("tool failure is an explicit terminal event", async () => {
  const lifecycle = await activeTurn();
  const tools = new WebTurnToolLifecycle(lifecycle);
  await tools.requestBatch(["a"], 3);
  await tools.started("a", 4);
  await tools.failed("a", "tool timeout", 5);
  expect(lifecycle.snapshot()).toMatchObject({
    phase: "failed",
    terminal: { reason: "tool timeout" },
  });
});
