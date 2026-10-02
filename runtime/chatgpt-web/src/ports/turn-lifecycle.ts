import type {
  SequencedTurnEvent,
  TurnEvent,
  TurnState,
} from "../core/turn/turn-state-machine";

export interface TurnLifecycleTraceRecord {
  readonly traceId?: string;
  readonly turnId?: string;
  readonly requestId?: string;
  readonly source: SequencedTurnEvent["source"];
  readonly sequence: number;
  readonly timestamp: number;
  readonly type: TurnEvent["type"];
}

export interface TurnLifecycleDiagnosticSnapshot {
  readonly state: TurnState;
  readonly terminal?: TurnState["terminal"];
  readonly events: readonly TurnLifecycleTraceRecord[];
}

export interface TurnLifecycleSink {
  dispatch(source: SequencedTurnEvent["source"], event: TurnEvent): Promise<TurnState>;
  phase(): TurnState["phase"];
  diagnosticSnapshot?(): TurnLifecycleDiagnosticSnapshot;
}

export interface TurnLifecycleInspector extends TurnLifecycleSink {
  snapshot(): TurnState;
}

export interface TurnLifecycleJournalReader {
  events(): readonly SequencedTurnEvent[];
  traceEvents(): readonly TurnLifecycleTraceRecord[];
}
