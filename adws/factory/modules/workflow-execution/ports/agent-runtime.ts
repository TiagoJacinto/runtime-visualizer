import type { PrimitiveInvocationArguments } from "../domain/workflow";

export interface AgentRuntimePort {
  invoke(
    input: PrimitiveInvocationArguments & {
      readonly workspacePath?: string;
      readonly inputArtifact?: { readonly id: string; readonly value: unknown };
      readonly signal: AbortSignal;
    },
  ): unknown | Promise<unknown>;
}
