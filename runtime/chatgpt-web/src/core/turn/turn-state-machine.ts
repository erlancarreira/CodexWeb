export type TurnPhase =
  | "created"
  | "preparing"
  | "submitted"
  | "accepted"
  | "streaming"
  | "waiting_tool"
  | "tool_running"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export type TurnTerminalPhase = Extract<TurnPhase, "completed" | "failed" | "cancelled" | "timed_out">;
export type TurnFailureClassification = "benign" | "recoverable" | "terminal";

export type TurnEvent =
  | { type: "prepare"; at: number }
  | { type: "submission_sent"; at: number }
  | { type: "transport_accepted"; at: number; requestId: string; status: number }
  | { type: "transport_data"; at: number; requestId: string; bytes: number }
  | { type: "transport_finished"; at: number; requestId: string }
  | {
      type: "transport_failed";
      at: number;
      requestId: string;
      classification: TurnFailureClassification;
      reason: string;
    }
  | { type: "dom_revision"; at: number; revision: number }
  | { type: "tool_requested"; at: number; callIds: readonly string[] }
  | { type: "tool_started"; at: number; callId: string }
  | { type: "tool_completed"; at: number; callId: string }
  | { type: "tool_failed"; at: number; callId: string; reason: string }
  | { type: "complete"; at: number }
  | { type: "fail"; at: number; reason: string }
  | { type: "cancel"; at: number; reason?: string }
  | { type: "deadline_exceeded"; at: number; deadline: number };

export interface SequencedTurnEvent {
  readonly sequence: number;
  readonly source: "runtime" | "transport" | "dom" | "tool" | "client" | "watchdog";
  readonly event: TurnEvent;
}

export interface TurnTerminalCause {
  readonly phase: TurnTerminalPhase;
  readonly sequence: number;
  readonly reason?: string;
}

export interface TurnState {
  readonly phase: TurnPhase;
  readonly sequence: number;
  readonly primaryRequestId?: string;
  readonly acceptedStatus?: number;
  readonly hasTransportData: boolean;
  readonly transportFinished: boolean;
  readonly activeToolCalls: readonly string[];
  readonly startedToolCalls: readonly string[];
  readonly lastDomRevision?: number;
  readonly lastEventAt?: number;
  readonly lastTransportFailure?: {
    readonly requestId: string;
    readonly classification: TurnFailureClassification;
    readonly reason: string;
  };
  readonly terminal?: TurnTerminalCause;
}

export class InvalidTurnTransitionError extends Error {
  constructor(
    readonly phase: TurnPhase,
    readonly eventType: TurnEvent["type"],
    message?: string,
  ) {
    super(message ?? `Invalid turn transition: ${phase} + ${eventType}`);
    this.name = "InvalidTurnTransitionError";
  }
}

export function createTurnState(): TurnState {
  return {
    phase: "created",
    sequence: 0,
    hasTransportData: false,
    transportFinished: false,
    activeToolCalls: [],
    startedToolCalls: [],
  };
}

export function isTerminalTurnPhase(phase: TurnPhase): phase is TurnTerminalPhase {
  return phase === "completed" || phase === "failed" || phase === "cancelled" || phase === "timed_out";
}

function requirePhase(state: TurnState, event: TurnEvent, allowed: readonly TurnPhase[]): void {
  if (!allowed.includes(state.phase)) {
    throw new InvalidTurnTransitionError(state.phase, event.type);
  }
}

function assertFiniteTimestamp(at: number): void {
  if (!Number.isFinite(at) || at < 0) throw new Error("Turn event timestamp must be a finite non-negative number");
}

function assertRequestId(requestId: string): void {
  if (!requestId.trim()) throw new Error("Turn transport event requires a request id");
}

function uniqueIds(ids: readonly string[]): string[] {
  const normalized = ids.map(id => id.trim());
  if (normalized.some(id => !id)) throw new Error("Turn tool event requires non-empty call ids");
  if (new Set(normalized).size !== normalized.length) throw new Error("Turn tool event contains duplicate call ids");
  return normalized;
}

function withSequence(state: TurnState, input: SequencedTurnEvent, patch: Partial<TurnState>): TurnState {
  return {
    ...state,
    ...patch,
    sequence: input.sequence,
    lastEventAt: input.event.at,
  };
}

function terminalState(
  state: TurnState,
  input: SequencedTurnEvent,
  phase: TurnTerminalPhase,
  reason?: string,
): TurnState {
  return withSequence(state, input, {
    phase,
    terminal: { phase, sequence: input.sequence, ...(reason ? { reason } : {}) },
    activeToolCalls: [],
    startedToolCalls: [],
  });
}

export function sequenceTurnEvent(
  state: TurnState,
  source: SequencedTurnEvent["source"],
  event: TurnEvent,
): SequencedTurnEvent {
  return { sequence: state.sequence + 1, source, event };
}

export function reduceTurnState(state: TurnState, input: SequencedTurnEvent): TurnState {
  const { event } = input;
  assertFiniteTimestamp(event.at);
  if (!Number.isSafeInteger(input.sequence) || input.sequence !== state.sequence + 1) {
    throw new Error(`Turn event sequence must be exactly ${state.sequence + 1}, received ${input.sequence}`);
  }
  if (isTerminalTurnPhase(state.phase)) {
    throw new InvalidTurnTransitionError(state.phase, event.type, "Terminal turn state cannot transition");
  }

  switch (event.type) {
    case "prepare":
      requirePhase(state, event, ["created"]);
      return withSequence(state, input, { phase: "preparing" });

    case "submission_sent":
      // Submission evidence is monotonic and may arrive after stronger evidence from another
      // producer (for example an MCP tool request that raced ahead of the browser acknowledgement).
      // Never regress an already-advanced turn merely to record a late send boundary.
      requirePhase(state, event, [
        "preparing", "submitted", "accepted", "streaming", "waiting_tool", "tool_running", "finalizing",
      ]);
      return withSequence(state, input, {
        phase: state.phase === "preparing" ? "submitted" : state.phase,
      });

    case "transport_accepted": {
      requirePhase(state, event, ["submitted", "accepted", "streaming", "waiting_tool", "tool_running"]);
      assertRequestId(event.requestId);
      if (!Number.isSafeInteger(event.status) || event.status < 100 || event.status > 599) {
        throw new Error("Turn transport status must be a valid HTTP status");
      }
      const replacingPrimary = Boolean(
        state.primaryRequestId
        && state.primaryRequestId !== event.requestId,
      );
      const lastTransportFailure = state.lastTransportFailure;
      const canReplaceRecoverablePrimary = replacingPrimary
        && lastTransportFailure?.requestId === state.primaryRequestId
        && lastTransportFailure?.classification === "recoverable"
        && state.activeToolCalls.length === 0
        && !state.transportFinished;
      if (replacingPrimary && !canReplaceRecoverablePrimary) {
        throw new InvalidTurnTransitionError(
          state.phase,
          event.type,
          `Turn already owns primary request ${state.primaryRequestId}; received ${event.requestId}`,
        );
      }
      const phase = state.phase === "waiting_tool" || state.phase === "tool_running"
        ? state.phase
        : "accepted";
      return withSequence(state, input, {
        phase,
        primaryRequestId: event.requestId,
        acceptedStatus: event.status,
        ...(canReplaceRecoverablePrimary ? {
          hasTransportData: false,
          transportFinished: false,
        } : {}),
      });
    }

    case "transport_data": {
      requirePhase(state, event, ["accepted", "streaming", "waiting_tool", "tool_running", "finalizing"]);
      assertRequestId(event.requestId);
      if (!Number.isSafeInteger(event.bytes) || event.bytes <= 0) {
        throw new Error("Turn transport data event requires a positive safe-integer byte count");
      }
      if (state.phase === "finalizing") {
        // CDP/Network events can arrive after the primary response has already finished and the turn
        // has entered finalization. They are observationally late: consume them without reopening the
        // turn or allowing an auxiliary request to replace the primary response ownership.
        return withSequence(state, input, state.primaryRequestId === event.requestId
          ? { hasTransportData: true }
          : {});
      }
      if (state.primaryRequestId !== event.requestId) {
        throw new InvalidTurnTransitionError(state.phase, event.type, "Transport data does not belong to the primary request");
      }
      return withSequence(state, input, {
        phase: state.phase === "waiting_tool" || state.phase === "tool_running" ? state.phase : "streaming",
        hasTransportData: true,
      });
    }

    case "transport_finished": {
      requirePhase(state, event, ["accepted", "streaming", "waiting_tool", "tool_running", "finalizing"]);
      assertRequestId(event.requestId);
      if (state.primaryRequestId !== event.requestId) {
        // Auxiliary/observability requests may finish after the primary ChatGPT response has already
        // been selected. Their completion is monotonic but must never replace or finish the primary
        // request. Consume the sequenced event as a no-op so a harmless late Network.loadingFinished
        // cannot tear down the entire Codex turn.
        return withSequence(state, input, {});
      }
      return withSequence(state, input, {
        transportFinished: true,
        phase: state.activeToolCalls.length > 0 ? state.phase : "finalizing",
      });
    }

    case "transport_failed": {
      requirePhase(state, event, ["submitted", "accepted", "streaming", "waiting_tool", "tool_running"]);
      assertRequestId(event.requestId);
      const failure = {
        requestId: event.requestId,
        classification: event.classification,
        reason: event.reason,
      } as const;
      if (event.classification === "terminal") {
        return terminalState(
          { ...state, lastTransportFailure: failure },
          input,
          "failed",
          event.reason,
        );
      }
      if (event.classification === "benign") {
        return withSequence(state, input, {
          lastTransportFailure: failure,
          transportFinished: true,
          phase: state.activeToolCalls.length > 0 ? state.phase : "finalizing",
        });
      }
      return withSequence(state, input, { lastTransportFailure: failure });
    }

    case "dom_revision": {
      requirePhase(state, event, [
        "preparing", "submitted", "accepted", "streaming", "waiting_tool", "tool_running", "finalizing",
      ]);
      if (!Number.isSafeInteger(event.revision) || event.revision < 0) {
        throw new Error("DOM revision must be a non-negative safe integer");
      }
      if (state.lastDomRevision !== undefined && event.revision < state.lastDomRevision) {
        throw new Error("DOM revision cannot move backwards");
      }
      return withSequence(state, input, { lastDomRevision: event.revision });
    }

    case "tool_requested": {
      // A current-turn MCP request is itself conclusive proof that ChatGPT accepted the
      // submission. It may race ahead of CDP responseReceived, so "submitted" is a valid
      // entry point. A later transport_accepted event fills request identity/status without
      // disturbing the active tool phase.
      requirePhase(state, event, ["preparing", "submitted", "accepted", "streaming", "finalizing"]);
      const callIds = uniqueIds(event.callIds);
      if (callIds.length === 0) throw new Error("Tool request event requires at least one call");
      if (state.activeToolCalls.length > 0) {
        throw new InvalidTurnTransitionError(state.phase, event.type, "A tool batch is already active");
      }
      return withSequence(state, input, {
        phase: "waiting_tool",
        activeToolCalls: callIds,
        startedToolCalls: [],
      });
    }

    case "tool_started": {
      requirePhase(state, event, ["waiting_tool", "tool_running"]);
      const callId = event.callId.trim();
      if (!state.activeToolCalls.includes(callId)) {
        throw new InvalidTurnTransitionError(state.phase, event.type, `Unknown active tool call: ${callId}`);
      }
      const started = state.startedToolCalls.includes(callId)
        ? [...state.startedToolCalls]
        : [...state.startedToolCalls, callId];
      return withSequence(state, input, { phase: "tool_running", startedToolCalls: started });
    }

    case "tool_completed": {
      requirePhase(state, event, ["waiting_tool", "tool_running"]);
      const callId = event.callId.trim();
      if (!state.activeToolCalls.includes(callId)) {
        throw new InvalidTurnTransitionError(state.phase, event.type, `Unknown active tool call: ${callId}`);
      }
      const remaining = state.activeToolCalls.filter(id => id !== callId);
      const started = state.startedToolCalls.filter(id => id !== callId);
      return withSequence(state, input, {
        activeToolCalls: remaining,
        startedToolCalls: started,
        phase: remaining.length > 0
          ? (started.length > 0 ? "tool_running" : "waiting_tool")
          : (state.transportFinished ? "finalizing" : "streaming"),
      });
    }

    case "tool_failed":
      requirePhase(state, event, ["waiting_tool", "tool_running"]);
      if (!state.activeToolCalls.includes(event.callId.trim())) {
        throw new InvalidTurnTransitionError(state.phase, event.type, `Unknown active tool call: ${event.callId}`);
      }
      return terminalState(state, input, "failed", event.reason);

    case "complete":
      requirePhase(state, event, ["accepted", "streaming", "finalizing"]);
      if (state.activeToolCalls.length > 0) {
        throw new InvalidTurnTransitionError(state.phase, event.type, "Turn cannot complete with active tool calls");
      }
      return terminalState(state, input, "completed");

    case "fail":
      if (!event.reason.trim()) throw new Error("Turn failure requires a reason");
      return terminalState(state, input, "failed", event.reason);

    case "cancel":
      return terminalState(state, input, "cancelled", event.reason);

    case "deadline_exceeded":
      if (!Number.isFinite(event.deadline) || event.deadline < 0) throw new Error("Turn deadline must be finite");
      return terminalState(state, input, "timed_out", `deadline_exceeded:${event.deadline}`);
  }
}
