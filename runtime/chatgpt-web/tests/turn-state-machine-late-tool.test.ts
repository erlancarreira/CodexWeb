import { expect, test } from "bun:test";
import { createTurnState, reduceTurnState, sequenceTurnEvent, type SequencedTurnEvent, type TurnEvent, type TurnState } from "../src/core/turn/turn-state-machine";

function apply(state: TurnState, source: SequencedTurnEvent["source"], event: TurnEvent): TurnState {
  return reduceTurnState(state, sequenceTurnEvent(state, source, event));
}

test("late tool batch can reopen a finalizing turn until its result settles", () => {
  let state = createTurnState();
  state = apply(state, "runtime", { type: "prepare", at: 1 });
  state = apply(state, "runtime", { type: "submission_sent", at: 2 });
  state = apply(state, "transport", { type: "transport_accepted", at: 3, requestId: "r1", status: 200 });
  state = apply(state, "transport", { type: "transport_finished", at: 4, requestId: "r1" });
  expect(state.phase).toBe("finalizing");
  state = apply(state, "tool", { type: "tool_requested", at: 5, callIds: ["call-1"] });
  expect(state.phase).toBe("waiting_tool");
  state = apply(state, "tool", { type: "tool_started", at: 6, callId: "call-1" });
  expect(state.phase).toBe("tool_running");
  state = apply(state, "tool", { type: "tool_completed", at: 7, callId: "call-1" });
  expect(state.phase).toBe("finalizing");
});
