export type TimingPolicyKind = "deadline" | "watchdog" | "settle";

export interface TimingPolicy {
  readonly name: string;
  readonly kind: TimingPolicyKind;
  readonly timeoutMs: number;
}

export function defineTimingPolicy(
  name: string,
  kind: TimingPolicyKind,
  timeoutMs: number,
): TimingPolicy {
  if (!name.trim()) throw new Error("Timing policy requires a name");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Timing policy timeout must be a positive safe integer");
  }
  return Object.freeze({ name, kind, timeoutMs });
}
