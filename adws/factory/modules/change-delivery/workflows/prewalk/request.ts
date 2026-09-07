export interface PrewalkRequest {
  readonly prompt: string;
  readonly sourceRepository?: string;
  readonly expectedSourceRevision?: string;
}

export interface PrewalkResult {
  readonly workflowId: "prewalk";
  readonly proposalArtifact: string;
}
