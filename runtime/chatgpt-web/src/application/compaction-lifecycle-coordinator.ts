import {
  createCompactionState,
  reduceCompactionState,
  type CompactionEvent,
  type CompactionState,
} from "../core/compaction/compaction-session";

export interface CompactionLifecycleCoordinatorOptions {
  maxJournalEvents?: number;
  now?: () => number;
}

/**
 * Single-writer application boundary for a structured compaction transaction.
 *
 * Compaction has different terminal semantics from normal assistant streaming, so it owns a
 * dedicated state machine and bounded journal rather than borrowing the ordinary turn actor.
 */
export class CompactionLifecycleCoordinator {
  private state = createCompactionState();
  private readonly journal: CompactionEvent[] = [];
  private readonly maxJournalEvents: number;
  private readonly now: () => number;
  private tail: Promise<void> = Promise.resolve();

  constructor(options: CompactionLifecycleCoordinatorOptions = {}) {
    this.maxJournalEvents = options.maxJournalEvents ?? 128;
    if (!Number.isSafeInteger(this.maxJournalEvents) || this.maxJournalEvents < 16) {
      throw new Error("Compaction journal capacity must be a safe integer >= 16");
    }
    this.now = options.now ?? Date.now;
  }

  snapshot(): CompactionState {
    return this.state;
  }

  events(): readonly CompactionEvent[] {
    return this.journal.map(event => ({ ...event }));
  }

  dispatch(event: CompactionEvent): Promise<CompactionState> {
    let resolveState!: (state: CompactionState) => void;
    let rejectState!: (error: Error) => void;
    const result = new Promise<CompactionState>((resolve, reject) => {
      resolveState = resolve;
      rejectState = reject;
    });
    this.tail = this.tail.then(() => {
      try {
        this.state = reduceCompactionState(this.state, event);
        this.journal.push({ ...event });
        if (this.journal.length > this.maxJournalEvents) {
          this.journal.splice(0, this.journal.length - this.maxJournalEvents);
        }
        resolveState(this.state);
      } catch (error) {
        rejectState(error instanceof Error ? error : new Error(String(error)));
      }
    });
    return result;
  }

  settleSource(at = this.now()): Promise<CompactionState> {
    return this.dispatch({ type: "settle_source", at });
  }

  waitHandoff(transactionId: string, at = this.now()): Promise<CompactionState> {
    return this.dispatch({ type: "wait_handoff", at, transactionId });
  }

  handoffReceived(at = this.now()): Promise<CompactionState> {
    return this.dispatch({ type: "handoff_received", at });
  }

  complete(at = this.now()): Promise<CompactionState> {
    return this.dispatch({ type: "complete", at });
  }

  retireBrowser(at = this.now()): Promise<CompactionState> {
    return this.dispatch({ type: "retire_browser", at });
  }

  browserRetired(at = this.now()): Promise<CompactionState> {
    return this.dispatch({ type: "browser_retired", at });
  }

  fail(reason: string, at = this.now()): Promise<CompactionState> {
    return this.dispatch({ type: "fail", at, reason });
  }

  cancel(reason?: string, at = this.now()): Promise<CompactionState> {
    return this.dispatch({ type: "cancel", at, ...(reason ? { reason } : {}) });
  }
}
