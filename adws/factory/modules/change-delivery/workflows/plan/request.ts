export interface PlanRequest {
  readonly prompt: string;
  readonly agentOwner: "planner";
  readonly sourceRepository?: string;
  readonly expectedSourceRevision?: string;
}

export interface PlanResult {
  readonly workflowId: "plan";
  readonly proposalArtifact: string;
}
