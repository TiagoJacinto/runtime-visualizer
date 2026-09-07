export interface ScoutRequest {
  readonly prompt: string;
  readonly agentOwner: "scout";
  readonly sourceRepository?: string;
  readonly expectedSourceRevision?: string;
}

export interface ScoutResult {
  readonly workflowId: "scout";
  readonly proposalArtifact: string;
}
