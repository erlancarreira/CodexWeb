import type {
  SequencedTurnEvent,
  TurnEvent,
  TurnPhase,
  TurnState,
} from "../../core/turn/turn-state-machine";

const TURN_PHASES = new Set<TurnPhase>([
  "created", "preparing", "submitted", "accepted", "streaming", "waiting_tool",
  "tool_running", "finalizing", "completed", "failed", "cancelled", "timed_out",
]);
const SOURCES = new Set<SequencedTurnEvent["source"]>([
  "runtime", "transport", "dom", "tool", "client", "watchdog",
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " must be an object");
  }
  return value as Record<string, unknown>;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(label + " must be a finite non-negative number");
  }
  return value;
}

function safeInt(value: unknown, label: string, min = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) {
    throw new Error(label + " must be a safe integer >= " + min);
  }
  return value;
}

function text(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(label + " must be a non-empty string");
  }
  return value;
}

export interface TurnLifecycleWireEvent {
  source: SequencedTurnEvent["source"];
  event: TurnEvent;
}

export function parseTurnLifecycleWireEvent(value: unknown): TurnLifecycleWireEvent {
  const input = record(value, "Turn lifecycle event");
  const source = text(input.source, "Turn lifecycle source");
  if (!SOURCES.has(source as SequencedTurnEvent["source"])) {
    throw new Error("Turn lifecycle source is invalid");
  }
  const raw = record(input.event, "Turn lifecycle payload");
  const type = text(raw.type, "Turn lifecycle event type");
  const at = finite(raw.at, "Turn lifecycle event timestamp");

  let event: TurnEvent;
  switch (type) {
    case "prepare":
    case "submission_sent":
    case "complete":
      event = { type, at };
      break;
    case "transport_accepted":
      event = {
        type,
        at,
        requestId: text(raw.requestId, "Transport request id"),
        status: safeInt(raw.status, "Transport status", 100),
      };
      if (event.status > 599) throw new Error("Transport status is invalid");
      break;
    case "transport_data":
      event = {
        type,
        at,
        requestId: text(raw.requestId, "Transport request id"),
        bytes: safeInt(raw.bytes, "Transport bytes", 1),
      };
      break;
    case "transport_finished":
      event = { type, at, requestId: text(raw.requestId, "Transport request id") };
      break;
    case "transport_failed": {
      const classification = text(raw.classification, "Transport failure classification");
      if (!["benign", "recoverable", "terminal"].includes(classification)) {
        throw new Error("Transport failure classification is invalid");
      }
      event = {
        type,
        at,
        requestId: text(raw.requestId, "Transport request id"),
        classification: classification as "benign" | "recoverable" | "terminal",
        reason: text(raw.reason, "Transport failure reason"),
      };
      break;
    }
    case "dom_revision":
      event = { type, at, revision: safeInt(raw.revision, "DOM revision") };
      break;
    case "tool_requested": {
      if (!Array.isArray(raw.callIds) || raw.callIds.length === 0) {
        throw new Error("Tool request requires call ids");
      }
      event = { type, at, callIds: raw.callIds.map((id, index) => text(id, "Tool call id " + index)) };
      break;
    }
    case "tool_started":
    case "tool_completed":
      event = { type, at, callId: text(raw.callId, "Tool call id") };
      break;
    case "tool_failed":
      event = {
        type,
        at,
        callId: text(raw.callId, "Tool call id"),
        reason: text(raw.reason, "Tool failure reason"),
      };
      break;
    case "fail":
      event = { type, at, reason: text(raw.reason, "Turn failure reason") };
      break;
    case "cancel":
      event = {
        type,
        at,
        ...(raw.reason === undefined ? {} : { reason: text(raw.reason, "Turn cancellation reason") }),
      };
      break;
    case "deadline_exceeded":
      event = { type, at, deadline: finite(raw.deadline, "Turn deadline") };
      break;
    default:
      throw new Error("Turn lifecycle event type is invalid");
  }

  return { source: source as SequencedTurnEvent["source"], event };
}

export function parseTurnLifecycleState(value: unknown): TurnState {
  const input = record(value, "Turn lifecycle state");
  const phase = text(input.phase, "Turn lifecycle phase");
  if (!TURN_PHASES.has(phase as TurnPhase)) throw new Error("Turn lifecycle phase is invalid");
  const sequence = safeInt(input.sequence, "Turn lifecycle sequence");
  if (typeof input.hasTransportData !== "boolean" || typeof input.transportFinished !== "boolean") {
    throw new Error("Turn lifecycle transport flags are invalid");
  }
  if (!Array.isArray(input.activeToolCalls) || !input.activeToolCalls.every(id => typeof id === "string")
    || !Array.isArray(input.startedToolCalls) || !input.startedToolCalls.every(id => typeof id === "string")) {
    throw new Error("Turn lifecycle tool state is invalid");
  }
  return structuredClone(input) as unknown as TurnState;
}
