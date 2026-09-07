import {
  WorkflowExecutor,
  type WorkflowExecutionAdapters,
} from "./application/execute-workflow";
import type {
  WorkflowDefinition,
  WorkflowExecutionRequest,
  WorkflowFactory,
  WorkflowRun,
  RunSnapshot,
} from "./domain/workflow";

export class Factory implements WorkflowFactory {
  private readonly executor: WorkflowExecutor;
  constructor(
    workflows: readonly WorkflowDefinition[] = [],
    adapters: WorkflowExecutionAdapters = {},
  ) {
    this.executor = new WorkflowExecutor(workflows, adapters);
  }
  execute(
    request: WorkflowExecutionRequest & { readonly workflowId: string },
  ): Promise<WorkflowRun> {
    return this.executor.execute(request);
  }
  inspect(runIdentifier: string): RunSnapshot | undefined {
    return this.executor.inspect(runIdentifier);
  }
  decide(
    runIdentifier: string,
    decision: Parameters<WorkflowFactory["decide"]>[1],
  ): RunSnapshot {
    return this.executor.decide(runIdentifier, decision);
  }
}

export type { WorkflowExecutionAdapters } from "./application/execute-workflow";
export * from "./domain/workflow";
export * from "./domain/phase";
export * from "./domain/handoff";
export * from "./domain/budget";
export type { AgentRuntimePort } from "./ports/agent-runtime";
export type { ArtifactStorePort } from "./ports/artifact-store";
export type {
  CommandRequest,
  CommandResult,
  CommandRunnerPort,
} from "./ports/command-runner";
export type { HumanGatePort } from "./ports/human-gate";
export type { TraceEvent, TraceSinkPort } from "./ports/trace-sink";
export type {
  SourceState,
  WorkspaceLease,
  WorkspacePort,
} from "./ports/workspace";
export { executeWithAgentFix } from "./application/execute-workflow/repair";
export type {
  ExecuteWithAgentFixOptions,
  Agent,
} from "./application/execute-workflow/repair";
export { runPrewalk } from "./application/run-prewalk";
export type {
  BuiltInPiTool,
  ModelSelection,
  PiToolResult,
  PiTurn,
  PiSession,
  PrewalkOptions,
  PrewalkRun,
} from "./application/run-prewalk";
