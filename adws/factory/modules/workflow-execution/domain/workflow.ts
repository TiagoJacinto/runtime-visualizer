export type WorkflowId = string;
export type WorkflowCapability =
  | "change-delivery"
  | "factory-distribution"
  | (string & {});

export interface WorkflowDescription {
  readonly name: string;
  readonly purpose?: string;
  readonly changesSource?: boolean;
}

export type PrimitiveType = "AI" | "Harness" | "Gate";
export type InvocationStatus = "Succeeded" | "Failed";
export type PrimitiveResultType<T extends PrimitiveType> =
  `${T}InvocationResult`;
export type WorkflowFailure =
  | "DirtySource"
  | "UnexpectedSourceRevision"
  | "SourceChanged"
  | "NonGitSource"
  | "CommandFailed"
  | "GateRejected"
  | "BudgetExhausted";
export type WorkspaceIsolation = "IndependentClone";
export type SourceIntegrity = "Verified" | "Changed";
export type WorkspaceDisposition = "Retained";

export interface Artifact {
  readonly id: string;
  readonly producerInvocationId: string;
  consumerInvocationId?: string;
  readonly value: unknown;
}

export interface RunContext {
  readonly artifacts: Map<string, Artifact>;
}

export interface PrimitiveCallOptions {
  readonly inputArtifact?: string;
  readonly outputArtifact?: string;
  readonly agentOwner?: string;
}

export interface InvocationResult<T extends PrimitiveType = PrimitiveType> {
  readonly order: number;
  readonly invocationId: string;
  readonly name: string;
  readonly primitiveType: T;
  readonly resultType: PrimitiveResultType<T>;
  readonly status: InvocationStatus;
  readonly input: string;
  readonly consumedArtifact?: string;
  readonly producedArtifact?: string;
  readonly workspacePath?: string;
  readonly output?: unknown;
  readonly error?: string;
}

export type AIInvocationResult = InvocationResult<"AI">;
export type HarnessInvocationResult = InvocationResult<"Harness">;
export type GateInvocationResult = InvocationResult<"Gate">;

export interface PrimitiveInvocationArguments {
  readonly invocationId: string;
  readonly runIdentifier?: string;
  readonly name: string;
  readonly input: string;
  readonly options?: PrimitiveCallOptions;
}

export type PrimitiveAdapter = (
  args: PrimitiveInvocationArguments & {
    readonly inputArtifact?: Artifact;
    readonly workspacePath?: string;
    readonly signal: AbortSignal;
  },
) => unknown | Promise<unknown>;

export type PrimitiveFunction<T extends PrimitiveType> = (
  invocationId: string,
  name: string,
  input: string,
  options?: PrimitiveCallOptions,
) => Promise<InvocationResult<T>>;

export interface WorkflowPrimitives {
  readonly context: RunContext;
  readonly ai: PrimitiveFunction<"AI">;
  readonly harness: PrimitiveFunction<"Harness">;
  readonly gate: PrimitiveFunction<"Gate">;
}

import type { CommandRequest, CommandResult } from "../ports/command-runner";
import type { PhaseDefinition, PhaseRecord } from "./phase";
import type { Budget } from "./budget";

export interface WorkflowContext extends WorkflowPrimitives {
  readonly workflowId: WorkflowId;
  readonly artifacts: Map<string, Artifact>;
  readonly runIdentifier: string;
  readonly request?: string;
  readonly agentOwner?: string;
  readonly problemFolder?: string;
  readonly workspacePath?: string;
  readonly phase: (
    definition: PhaseDefinition,
    body: () => Promise<void> | void,
  ) => Promise<void>;
  readonly command: (request: CommandRequest) => Promise<CommandResult>;
  readonly review: () => Promise<IntegrationDecision | undefined>;
}

export type WorkflowController = (
  context: WorkflowContext,
) => Promise<void> | void;

export interface WorkflowDefinition {
  readonly id: WorkflowId;
  readonly capability?: WorkflowCapability;
  readonly name?: string;
  readonly describe?: () => WorkflowDescription;
  readonly changesSource?: boolean;
  readonly controller: WorkflowController;
}

export interface WorkflowExecutionRequest {
  readonly sourceRepository?: string;
  readonly expectedSourceRevision?: string;
  readonly workspaceRoot?: string;
  readonly runIdentifier?: string;
  readonly request?: string;
  readonly agentOwner?: string;
  readonly problemFolder?: string;
  readonly budget?: Budget;
}

export interface EvidenceManifest {
  readonly runIdentifier: string;
  readonly workflowId: WorkflowId;
  readonly status: "Succeeded" | "Failed" | "AwaitingReview";
  readonly artifacts: readonly EvidenceEntry[];
  readonly source?: {
    readonly repository: string;
    readonly revision: string;
    readonly integrity: SourceIntegrity;
  };
  readonly integration?: IntegrationDecision;
}

export interface EvidenceEntry {
  readonly kind: string;
  readonly reference: string;
  readonly summary?: string;
}

export interface IntegrationDecision {
  readonly outcome: "Accepted" | "Rejected" | "Deferred";
  readonly decidedAt: string;
  readonly decidedBy: string;
  readonly reason?: string;
}

export interface RunSnapshot {
  readonly runIdentifier: string;
  readonly workflowId: WorkflowId;
  readonly status: "Succeeded" | "Failed" | "AwaitingReview";
  readonly evidenceManifest: EvidenceManifest;
  readonly source?: EvidenceManifest["source"];
  readonly integration?: IntegrationDecision;
  readonly evidenceManifestPath?: string;
}

export interface WorkflowRun {
  readonly workflowId: WorkflowId;
  readonly status: "Succeeded" | "Failed" | "AwaitingReview";
  readonly invocations: readonly InvocationResult[];
  readonly context: RunContext;
  readonly phases: readonly PhaseRecord[];
  readonly runIdentifier: string;
  readonly sourceRevision?: string;
  readonly workspacePath?: string;
  readonly workspaceIsolation?: WorkspaceIsolation;
  readonly sourceIntegrity?: SourceIntegrity;
  readonly workspaceDisposition?: WorkspaceDisposition;
  readonly failure?: WorkflowFailure | string;
  readonly evidenceManifest: EvidenceManifest;
  readonly evidenceManifestPath?: string;
  readonly integration?: IntegrationDecision;
}

export interface WorkflowFactory {
  execute(
    request: WorkflowExecutionRequest & { readonly workflowId: WorkflowId },
  ): Promise<WorkflowRun>;
  inspect(runIdentifier: string): RunSnapshot | undefined;
  decide(
    runIdentifier: string,
    decision: Omit<IntegrationDecision, "decidedAt">,
  ): RunSnapshot;
}
