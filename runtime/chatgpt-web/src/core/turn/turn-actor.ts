import {
  createTurnState,
  isTerminalTurnPhase,
  reduceTurnState,
  sequenceTurnEvent,
  type SequencedTurnEvent,
  type TurnEvent,
  type TurnState,
} from "./turn-state-machine";

interface DispatchWaiter {
  resolve: (state: TurnState) => void;
  reject: (error: Error) => void;
}

interface MailboxItem {
  source: SequencedTurnEvent["source"];
  event: TurnEvent;
  waiters: DispatchWaiter[];
}

export interface TurnActorOptions {
  maxQueueSize?: number;
  onTransition?: (state: TurnState, event: SequencedTurnEvent) => void | Promise<void>;
}

export class TurnMailboxOverflowError extends Error {
  constructor(readonly maxQueueSize: number) {
    super(`Turn mailbox exceeded bounded capacity ${maxQueueSize}`);
    this.name = "TurnMailboxOverflowError";
  }
}

export class TurnActorClosedError extends Error {
  constructor(message = "Turn actor is closed") {
    super(message);
    this.name = "TurnActorClosedError";
  }
}

function isCoalescible(event: TurnEvent): event is Extract<TurnEvent, { type: "dom_revision" }> {
  return event.type === "dom_revision";
}

function isCritical(event: TurnEvent): boolean {
  return event.type !== "dom_revision";
}

/**
 * Single-writer owner for one turn.
 *
 * Producers may dispatch concurrently, but only the actor drain mutates the turn state.
 * The mailbox is bounded. Replaceable DOM revisions may be coalesced; network/tool/terminal
 * events are never silently dropped.
 */
export class TurnActor {
  private state = createTurnState();
  private readonly queue: MailboxItem[] = [];
  private readonly maxQueueSize: number;
  private readonly onTransition?: TurnActorOptions["onTransition"];
  private draining = false;
  private closedError?: Error;

  constructor(options: TurnActorOptions = {}) {
    const maxQueueSize = options.maxQueueSize ?? 256;
    if (!Number.isSafeInteger(maxQueueSize) || maxQueueSize < 8) {
      throw new Error("Turn actor maxQueueSize must be a safe integer >= 8");
    }
    this.maxQueueSize = maxQueueSize;
    this.onTransition = options.onTransition;
  }

  snapshot(): TurnState {
    return this.state;
  }

  pending(): number {
    return this.queue.length;
  }

  dispatch(source: SequencedTurnEvent["source"], event: TurnEvent): Promise<TurnState> {
    if (this.closedError) return Promise.reject(this.closedError);

    return new Promise<TurnState>((resolve, reject) => {
      const waiter = { resolve, reject };
      if (isCoalescible(event)) {
        const existing = this.findPendingCoalescible();
        if (existing) {
          const current = existing.event as Extract<TurnEvent, { type: "dom_revision" }>;
          existing.event = event.revision >= current.revision ? event : current;
          existing.waiters.push(waiter);
          this.scheduleDrain();
          return;
        }
      }

      if (this.queue.length >= this.maxQueueSize && isCritical(event)) {
        this.evictOneCoalescible();
      }
      if (this.queue.length >= this.maxQueueSize) {
        reject(new TurnMailboxOverflowError(this.maxQueueSize));
        return;
      }

      this.queue.push({ source, event, waiters: [waiter] });
      this.scheduleDrain();
    });
  }

  close(reason = new TurnActorClosedError()): void {
    if (this.closedError) return;
    this.closedError = reason;
    const pending = this.queue.splice(0);
    for (const item of pending) {
      for (const waiter of item.waiters) waiter.reject(reason);
    }
  }

  private findPendingCoalescible(): MailboxItem | undefined {
    // Coalescing may collapse only the contiguous replaceable tail. Searching past a critical
    // event would move a later DOM revision ahead of network/tool/terminal evidence and violate
    // mailbox arrival order.
    const tail = this.queue.at(-1);
    return tail && isCoalescible(tail.event) ? tail : undefined;
  }

  private evictOneCoalescible(): void {
    const index = this.queue.findIndex(item => isCoalescible(item.event));
    if (index < 0) return;
    const [removed] = this.queue.splice(index, 1);
    if (!removed) return;
    const error = new TurnMailboxOverflowError(this.maxQueueSize);
    for (const waiter of removed.waiters) waiter.reject(error);
  }

  private scheduleDrain(): void {
    if (this.draining) return;
    this.draining = true;
    queueMicrotask(() => {
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    try {
      while (!this.closedError) {
        const item = this.queue.shift();
        if (!item) break;

        try {
          const sequenced = sequenceTurnEvent(this.state, item.source, item.event);
          const next = reduceTurnState(this.state, sequenced);
          this.state = next;
          await this.onTransition?.(next, sequenced);
          for (const waiter of item.waiters) waiter.resolve(next);

          if (isTerminalTurnPhase(next.phase)) {
            const terminalError = new TurnActorClosedError(`Turn actor reached terminal state ${next.phase}`);
            this.closedError = terminalError;
            const remaining = this.queue.splice(0);
            for (const pending of remaining) {
              for (const waiter of pending.waiters) waiter.reject(terminalError);
            }
            break;
          }
        } catch (error) {
          const failure = error instanceof Error ? error : new Error(String(error));
          for (const waiter of item.waiters) waiter.reject(failure);
        }
      }
    } finally {
      this.draining = false;
      if (!this.closedError && this.queue.length > 0) this.scheduleDrain();
    }
  }
}
