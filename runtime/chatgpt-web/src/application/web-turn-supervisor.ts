import { WebTurnLifecycleCoordinator, type WebTurnLifecycleCoordinatorOptions } from "./web-turn-lifecycle-coordinator";

export interface WebTurnSupervisorOptions {
  maxActiveTurns?: number;
}

export class WebTurnSupervisor {
  private readonly turns = new Map<string, WebTurnLifecycleCoordinator>();
  private readonly maxActiveTurns: number;

  constructor(options: WebTurnSupervisorOptions = {}) {
    this.maxActiveTurns = options.maxActiveTurns ?? 256;
    if (!Number.isSafeInteger(this.maxActiveTurns) || this.maxActiveTurns < 1) {
      throw new Error("Turn supervisor capacity must be a positive safe integer");
    }
  }

  acquire(turnId: string, options: WebTurnLifecycleCoordinatorOptions = {}): WebTurnLifecycleCoordinator {
    const id = turnId.trim();
    if (!id) throw new Error("Turn supervisor requires a non-empty turn id");
    const existing = this.turns.get(id);
    if (existing && !["completed", "failed", "cancelled", "timed_out"].includes(existing.phase())) {
      return existing;
    }
    if (existing) this.turns.delete(id);
    if (this.activeCount() >= this.maxActiveTurns) {
      throw new Error(`Turn supervisor is at capacity (${this.maxActiveTurns})`);
    }
    const lifecycle = new WebTurnLifecycleCoordinator(options);
    this.turns.set(id, lifecycle);
    return lifecycle;
  }

  release(turnId: string, lifecycle: WebTurnLifecycleCoordinator): boolean {
    const id = turnId.trim();
    if (this.turns.get(id) !== lifecycle) return false;
    this.turns.delete(id);
    return true;
  }

  find(turnId: string): WebTurnLifecycleCoordinator | undefined {
    return this.turns.get(turnId.trim());
  }

  async cancel(turnId: string, reason: string): Promise<boolean> {
    const lifecycle = this.find(turnId);
    if (!lifecycle) return false;
    if (!["completed", "failed", "cancelled", "timed_out"].includes(lifecycle.phase())) {
      await lifecycle.cancel(reason);
    }
    return true;
  }

  activeCount(): number {
    let active = 0;
    for (const lifecycle of this.turns.values()) {
      if (!["completed", "failed", "cancelled", "timed_out"].includes(lifecycle.phase())) active += 1;
    }
    return active;
  }
}
