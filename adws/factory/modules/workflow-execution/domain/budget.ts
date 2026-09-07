export interface Budget {
  readonly maxPhases?: number;
  readonly maxInvocations?: number;
  readonly maxCommands?: number;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
}

export class BudgetExhaustedError extends Error {
  readonly failure = "BudgetExhausted" as const;
  constructor(message: string) {
    super(message);
    this.name = "BudgetExhaustedError";
  }
}
