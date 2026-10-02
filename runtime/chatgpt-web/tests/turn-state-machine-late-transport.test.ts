import { expect, test } from "bun:test";
import { createTurnState, reduceTurnState, sequenceTurnEvent, type SequencedTurnEvent, type TurnEvent, type TurnState } from "../src/core/turn/turn-state-machine";

function apply(state: TurnState, source: SequencedTurnEvent["source"], event: TurnEvent): TurnState {
  return reduceTurnState(state, sequenceTurnEvent(state, source, event));
}

test("late transport_finished remains valid while finalizing", () => {
  let state = createTurnState();
  state = apply(state, "runtime", { type: "prepare", at: 1 });
  state = apply(state, "runtime", { type: "submission_sent", at: 2 });
  state = apply(state, "transport", { type: "transport_accepted", at: 3, requestId: "r1", status: 200 });
  state = apply(state, "transport", { type: "transport_finished", at: 4, requestId: "r1" });
  expect(state.phase).toBe("finalizing");
  state = apply(state, "transport", { type: "transport_finished", at: 5, requestId: "r1" });
  expect(state.phase).toBe("finalizing");
  expect(state.transportFinished).toBeTrue();
});


test("late auxiliary transport_finished is consumed without replacing the primary request", () => {
  let state = createTurnState();
  state = apply(state, "runtime", { type: "prepare", at: 1 });
  state = apply(state, "runtime", { type: "submission_sent", at: 2 });
  state = apply(state, "transport", { type: "transport_accepted", at: 3, requestId: "primary", status: 200 });
  state = apply(state, "transport", { type: "transport_data", at: 4, requestId: "primary", bytes: 64 });

  const beforeSequence = state.sequence;
  state = apply(state, "transport", { type: "transport_finished", at: 5, requestId: "auxiliary" });

  expect(state.sequence).toBe(beforeSequence + 1);
  expect(state.primaryRequestId).toBe("primary");
  expect(state.transportFinished).toBeFalse();
  expect(state.phase).toBe("streaming");

  state = apply(state, "transport", { type: "transport_finished", at: 6, requestId: "primary" });
  expect(state.transportFinished).toBeTrue();
  expect(state.phase).toBe("finalizing");
});


test("late primary transport_data is consumed while finalizing without reopening the turn", () => {
  let state = createTurnState();
  state = apply(state, "runtime", { type: "prepare", at: 1 });
  state = apply(state, "runtime", { type: "submission_sent", at: 2 });
  state = apply(state, "transport", { type: "transport_accepted", at: 3, requestId: "primary", status: 200 });
  state = apply(state, "transport", { type: "transport_finished", at: 4, requestId: "primary" });
  expect(state.phase).toBe("finalizing");

  const beforeSequence = state.sequence;
  state = apply(state, "transport", { type: "transport_data", at: 5, requestId: "primary", bytes: 32 });

  expect(state.sequence).toBe(beforeSequence + 1);
  expect(state.phase).toBe("finalizing");
  expect(state.primaryRequestId).toBe("primary");
  expect(state.transportFinished).toBeTrue();
  expect(state.hasTransportData).toBeTrue();
});

test("late auxiliary transport_data is consumed while finalizing without replacing the primary request", () => {
  let state = createTurnState();
  state = apply(state, "runtime", { type: "prepare", at: 1 });
  state = apply(state, "runtime", { type: "submission_sent", at: 2 });
  state = apply(state, "transport", { type: "transport_accepted", at: 3, requestId: "primary", status: 200 });
  state = apply(state, "transport", { type: "transport_data", at: 4, requestId: "primary", bytes: 64 });
  state = apply(state, "transport", { type: "transport_finished", at: 5, requestId: "primary" });
  expect(state.phase).toBe("finalizing");

  const beforeSequence = state.sequence;
  state = apply(state, "transport", { type: "transport_data", at: 6, requestId: "auxiliary", bytes: 16 });

  expect(state.sequence).toBe(beforeSequence + 1);
  expect(state.phase).toBe("finalizing");
  expect(state.primaryRequestId).toBe("primary");
  expect(state.transportFinished).toBeTrue();
  expect(state.hasTransportData).toBeTrue();
});
