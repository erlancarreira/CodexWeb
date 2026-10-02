export class RecoveryBudgetExceededError extends Error {
  constructor(
    readonly name: string,
    readonly limit: number,
    readonly cause?: Error,
  ) {
    super(`Recovery budget "${name}" exhausted after ${limit} attempts`, cause ? { cause } : undefined);
    this.name = "RecoveryBudgetExceededError";
  }
}

/**
 * Named bounded recovery budget.
 *
 * It owns only retry/recovery allowance. It never sleeps, polls, or performs recovery itself.
 * Consumers execute the recovery action after a successful consume().
 */
export class BoundedRecoveryBudget {
  private usedAttempts = 0;

  constructor(
    readonly name: string,
    readonly limit: number,
  ) {
    if (!name.trim()) throw new Error("Recovery budget requires a name");
    if (!Number.isSafeInteger(limit) || limit < 0) {
      throw new Error("Recovery budget limit must be a non-negative safe integer");
    }
  }

  consume(cause?: Error): number {
    if (this.usedAttempts >= this.limit) {
      throw new RecoveryBudgetExceededError(this.name, this.limit, cause);
    }
    this.usedAttempts += 1;
    return this.usedAttempts;
  }

  reset(): void {
    this.usedAttempts = 0;
  }

  used(): number {
    return this.usedAttempts;
  }

  remaining(): number {
    return this.limit - this.usedAttempts;
  }
}
