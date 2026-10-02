import { TurnActor } from "../core/turn/turn-actor";
import { redactTurnDiagnosticText } from "../core/observability/redaction";
import type {
  SequencedTurnEvent,
  TurnEvent,
  TurnState,
} from "../core/turn/turn-state-machine";
import type {
  TurnLifecycleDiagnosticSnapshot,
  TurnLifecycleInspector,
  TurnLifecycleJournalReader,
  TurnLifecycleTraceRecord,
} from "../ports/turn-lifecycle";

export interface WebTurnLifecycleCoordinatorOptions {
  maxQueueSize?: number;
  maxJournalEvents?: number;
  now?: () => number;
  traceId?: string;
  turnId?: string;
}

/**
 * Application boundary for one automatic Web turn.
 *
 * Adapters publish immutable events through this coordinator. The enclosed TurnActor is the
 * single writer; the journal is bounded and diagnostic-only.
 */
export class WebTurnLifecycleCoordinator implements TurnLifecycleInspector, TurnLifecycleJournalReader {
  private readonly actor: TurnActor;
  private readonly journal: SequencedTurnEvent[] = [];
  private readonly maxJournalEvents: number;
  private readonly now: () => number;
  private readonly traceId?: string;
  private readonly turnId?: string;
  private readonly prepared: Promise<TurnState>;

  constructor(options: WebTurnLifecycleCoordinatorOptions = {}) {
    this.maxJournalEvents = options.maxJournalEvents ?? 512;
    if (!Number.isSafeInteger(this.maxJournalEvents) || this.maxJournalEvents < 32) {
      throw new Error("Turn lifecycle journal capacity must be a safe integer >= 32");
    }
    this.now = options.now ?? Date.now;
    this.traceId = options.traceId?.trim() || undefined;
    this.turnId = options.turnId?.trim() || undefined;
    this.actor = new TurnActor({
      ...(options.maxQueueSize !== undefined ? { maxQueueSize: options.maxQueueSize } : {}),
      onTransition: (_state, event) => {
        this.journal.push(event);
        if (this.journal.length > this.maxJournalEvents) {
          this.journal.splice(0, this.journal.length - this.maxJournalEvents);
        }
      },
    });
    this.prepared = this.actor.dispatch("runtime", { type: "prepare", at: this.now() });
  }

  async dispatch(source: SequencedTurnEvent["source"], event: TurnEvent): Promise<TurnState> {
    await this.prepared;
    return this.actor.dispatch(source, event);
  }

  snapshot(): TurnState {
    return this.actor.snapshot();
  }

  phase(): TurnState["phase"] {
    return this.actor.snapshot().phase;
  }

  events(): readonly SequencedTurnEvent[] {
    return this.journal.map(event => ({
      ...event,
      event: { ...event.event } as TurnEvent,
    }));
  }

  traceEvents(): readonly TurnLifecycleTraceRecord[] {
    return this.journal.map(entry => {
      const event = entry.event;
      const requestId = "requestId" in event && typeof event.requestId === "string"
        ? event.requestId
        : undefined;
      return {
        ...(this.traceId ? { traceId: this.traceId } : {}),
        ...(this.turnId ? { turnId: this.turnId } : {}),
        ...(requestId ? { requestId } : {}),
        source: entry.source,
        sequence: entry.sequence,
        timestamp: event.at,
        type: event.type,
      };
    });
  }

  diagnosticSnapshot(): TurnLifecycleDiagnosticSnapshot {
    const state = this.snapshot();
    const terminal = state.terminal
      ? {
        ...state.terminal,
        ...(state.terminal.reason ? { reason: redactTurnDiagnosticText(state.terminal.reason) } : {}),
      }
      : undefined;
    const lastTransportFailure = state.lastTransportFailure
      ? {
        ...state.lastTransportFailure,
        reason: redactTurnDiagnosticText(state.lastTransportFailure.reason),
      }
      : undefined;
    return {
      state: {
        ...state,
        activeToolCalls: [...state.activeToolCalls],
        startedToolCalls: [...state.startedToolCalls],
        ...(terminal ? { terminal } : {}),
        ...(lastTransportFailure ? { lastTransportFailure } : {}),
      },
      ...(terminal ? { terminal } : {}),
      events: this.traceEvents(),
    };
  }

  submissionSent(at = this.now()): Promise<TurnState> {
    return this.dispatch("runtime", { type: "submission_sent", at });
  }

  cancel(reason?: string, at = this.now()): Promise<TurnState> {
    return this.dispatch("client", { type: "cancel", at, ...(reason ? { reason } : {}) });
  }

  deadlineExceeded(deadline: number, at = this.now()): Promise<TurnState> {
    return this.dispatch("watchdog", { type: "deadline_exceeded", at, deadline });
  }
}
