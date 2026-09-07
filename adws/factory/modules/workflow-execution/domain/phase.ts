export type PhaseKind = "agent" | "code" | "engineer" | "gate";

export interface PhaseBudget {
  readonly maxInvocations?: number;
  readonly maxCommands?: number;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
}

export interface PhaseDefinition {
  readonly name: string;
  readonly kind?: PhaseKind;
  readonly owner?: string;
  readonly description: string;
  readonly budget?: PhaseBudget;
}

export interface PhaseRecord extends PhaseDefinition {
  readonly sequence: number;
  readonly status: "Running" | "Succeeded" | "Failed";
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly error?: string;
}
