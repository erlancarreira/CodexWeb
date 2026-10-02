import type { TurnLifecycleInspector } from "../ports/turn-lifecycle";

export class WebTurnToolLifecycle {
  constructor(private readonly lifecycle?: TurnLifecycleInspector) {}

  async requestBatch(callIds: readonly string[], at = Date.now()): Promise<void> {
    if (!this.lifecycle || callIds.length === 0) return;
    const normalized = callIds.map(callId => callId.trim());
    if (normalized.some(callId => !callId)) throw new Error("Tool batch contains an empty call id");
    const active = this.lifecycle.snapshot().activeToolCalls;
    if (active.length === 0) {
      await this.lifecycle.dispatch("tool", { type: "tool_requested", at, callIds: normalized });
      return;
    }
    const sameBatch = active.length === normalized.length
      && active.every(callId => normalized.includes(callId));
    if (!sameBatch) {
      throw new Error(
        `Tool batch does not match the actor-owned turn: active=${active.join(",")} received=${normalized.join(",")}`,
      );
    }
  }

  async started(callId: string, at = Date.now()): Promise<void> {
    if (!this.lifecycle) return;
    const state = this.lifecycle.snapshot();
    if (!state.activeToolCalls.includes(callId)) {
      throw new Error(`Tool call ${callId} is not owned by this turn`);
    }
    if (state.startedToolCalls.includes(callId)) return;
    await this.lifecycle.dispatch("tool", { type: "tool_started", at, callId });
  }

  async completed(callId: string, at = Date.now()): Promise<void> {
    if (!this.lifecycle) return;
    if (!this.lifecycle.snapshot().activeToolCalls.includes(callId)) {
      throw new Error(`Tool result ${callId} is not owned by this turn`);
    }
    await this.lifecycle.dispatch("tool", { type: "tool_completed", at, callId });
  }

  async failed(callId: string, reason: string, at = Date.now()): Promise<void> {
    if (!this.lifecycle) return;
    if (!this.lifecycle.snapshot().activeToolCalls.includes(callId)) {
      throw new Error(`Tool failure ${callId} is not owned by this turn`);
    }
    await this.lifecycle.dispatch("tool", { type: "tool_failed", at, callId, reason });
  }
}
