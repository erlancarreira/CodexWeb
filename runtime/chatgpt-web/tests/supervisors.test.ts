import { expect, test } from "bun:test";
import { BrowserSupervisor } from "../src/application/browser-supervisor";
import { WebTurnSupervisor } from "../src/application/web-turn-supervisor";
import { defineTimingPolicy } from "../src/core/resilience/timing-policy";

test("turn supervisor isolates simultaneous turn actors", async () => {
  const supervisor = new WebTurnSupervisor({ maxActiveTurns: 2 });
  const a = supervisor.acquire("a");
  const b = supervisor.acquire("b");
  await a.submissionSent(1);
  await b.submissionSent(1);
  await a.cancel("fault-a", 2);
  expect(a.phase()).toBe("cancelled");
  expect(b.phase()).toBe("submitted");
  expect(supervisor.find("b")).toBe(b);
  expect(supervisor.release("a", a)).toBeTrue();
});

test("browser supervisor closes resources independently and clears ownership first", async () => {
  const closed: string[] = [];
  const supervisor = new BrowserSupervisor<{ close(): Promise<void> }>();
  supervisor.acquire("a", () => ({ close: async () => { closed.push("a"); } }));
  supervisor.acquire("b", () => ({ close: async () => { closed.push("b"); } }));
  expect(supervisor.size()).toBe(2);
  await supervisor.closeAll();
  expect(supervisor.size()).toBe(0);
  expect(closed.sort()).toEqual(["a", "b"]);
});

test("timing policies are named and fail closed on invalid durations", () => {
  expect(defineTimingPolicy("event-wake", "watchdog", 5_000)).toEqual({
    name: "event-wake",
    kind: "watchdog",
    timeoutMs: 5_000,
  });
  expect(() => defineTimingPolicy("bad", "deadline", 0)).toThrow();
});
