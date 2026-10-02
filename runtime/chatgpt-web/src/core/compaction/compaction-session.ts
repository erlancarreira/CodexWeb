export type CompactionPhase =
  | "created"
  | "source_settling"
  | "handoff_waiting"
  | "handoff_received"
  | "browser_retiring"
  | "completed"
  | "failed"
  | "cancelled";

export type CompactionEvent =
  | { type: "settle_source"; at: number }
  | { type: "wait_handoff"; at: number; transactionId: string }
  | { type: "handoff_received"; at: number }
  | { type: "complete"; at: number }
  | { type: "retire_browser"; at: number }
  | { type: "browser_retired"; at: number }
  | { type: "fail"; at: number; reason: string }
  | { type: "cancel"; at: number; reason?: string };

export interface CompactionState {
  readonly phase: CompactionPhase;
  readonly sequence: number;
  readonly transactionId?: string;
  readonly handoffReceived: boolean;
  readonly browserRetired: boolean;
  readonly lastEventAt?: number;
  readonly terminalReason?: string;
}

export class InvalidCompactionTransitionError extends Error {
  constructor(readonly phase: CompactionPhase, readonly eventType: CompactionEvent["type"]) {
    super(`Invalid compaction transition: ${phase} + ${eventType}`);
    this.name = "InvalidCompactionTransitionError";
  }
}

export function createCompactionState(): CompactionState {
  return {
    phase: "created",
    sequence: 0,
    handoffReceived: false,
    browserRetired: false,
  };
}

function assertEvent(state: CompactionState, event: CompactionEvent, allowed: readonly CompactionPhase[]): void {
  if (!allowed.includes(state.phase)) throw new InvalidCompactionTransitionError(state.phase, event.type);
  if (!Number.isFinite(event.at) || event.at < 0) throw new Error("Compaction event timestamp must be finite and non-negative");
}

function next(state: CompactionState, event: CompactionEvent, patch: Partial<CompactionState>): CompactionState {
  return {
    ...state,
    ...patch,
    sequence: state.sequence + 1,
    lastEventAt: event.at,
  };
}

export function reduceCompactionState(state: CompactionState, event: CompactionEvent): CompactionState {
  if (state.phase === "completed" || state.phase === "failed" || state.phase === "cancelled") {
    throw new InvalidCompactionTransitionError(state.phase, event.type);
  }

  switch (event.type) {
    case "settle_source":
      assertEvent(state, event, ["created"]);
      return next(state, event, { phase: "source_settling" });

    case "wait_handoff":
      assertEvent(state, event, ["created", "source_settling"]);
      if (!event.transactionId.trim()) throw new Error("Compaction handoff requires a transaction id");
      return next(state, event, { phase: "handoff_waiting", transactionId: event.transactionId });

    case "handoff_received":
      assertEvent(state, event, ["handoff_waiting"]);
      return next(state, event, { phase: "handoff_received", handoffReceived: true });

    case "complete":
      assertEvent(state, event, ["handoff_received"]);
      if (!state.handoffReceived) throw new InvalidCompactionTransitionError(state.phase, event.type);
      return next(state, event, { phase: "completed" });

    case "retire_browser":
      assertEvent(state, event, ["handoff_received"]);
      return next(state, event, { phase: "browser_retiring" });

    case "browser_retired":
      assertEvent(state, event, ["browser_retiring"]);
      if (!state.handoffReceived) throw new InvalidCompactionTransitionError(state.phase, event.type);
      return next(state, event, {
        phase: "completed",
        browserRetired: true,
      });

    case "fail":
      assertEvent(state, event, [
        "created", "source_settling", "handoff_waiting", "handoff_received", "browser_retiring",
      ]);
      return next(state, event, { phase: "failed", terminalReason: event.reason });

    case "cancel":
      assertEvent(state, event, [
        "created", "source_settling", "handoff_waiting", "handoff_received", "browser_retiring",
      ]);
      return next(state, event, {
        phase: "cancelled",
        ...(event.reason ? { terminalReason: event.reason } : {}),
      });
  }
}
