import type { TurnLifecycleSink } from "../../ports/turn-lifecycle";

export interface ChatGptDomLifecycleObservation {
  readonly at: number;
  readonly observerKey?: string;
  readonly responsePresent: boolean;
  readonly identity?: string;
}

export interface ChatGptDomLifecycleSnapshot {
  readonly revision: number;
  readonly responsePresent: boolean;
  readonly observerKey?: string;
  readonly identity?: string;
}

/**
 * Converts MutationObserver-backed response snapshots into monotonic lifecycle events.
 *
 * The browser remains responsible for extracting rendered text and controls. This adapter only
 * reports that the observed assistant surface changed. It never decides turn completion/failure.
 */
export class ChatGptDomLifecycleAdapter {
  private revision = 0;
  private lastObserverKey?: string;
  private lastIdentity?: string;
  private responsePresent = false;

  constructor(private readonly lifecycle?: TurnLifecycleSink) {}

  snapshot(): ChatGptDomLifecycleSnapshot {
    return {
      revision: this.revision,
      responsePresent: this.responsePresent,
      ...(this.lastObserverKey ? { observerKey: this.lastObserverKey } : {}),
      ...(this.lastIdentity ? { identity: this.lastIdentity } : {}),
    };
  }

  async observe(observation: ChatGptDomLifecycleObservation): Promise<boolean> {
    if (!Number.isFinite(observation.at) || observation.at < 0) {
      throw new Error("DOM lifecycle observation timestamp must be finite and non-negative");
    }
    const identity = observation.identity?.trim() || undefined;
    const observerKey = observation.observerKey?.trim() || undefined;
    const changed = observerKey !== this.lastObserverKey
      || identity !== this.lastIdentity
      || observation.responsePresent !== this.responsePresent;

    if (!changed) return false;

    this.lastObserverKey = observerKey;
    this.lastIdentity = identity;
    this.responsePresent = observation.responsePresent;
    this.revision += 1;

    await this.lifecycle?.dispatch("dom", {
      type: "dom_revision",
      at: observation.at,
      revision: this.revision,
    });
    return true;
  }
}
