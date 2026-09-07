export interface DoubleTddRequest {
  readonly prompt: string;
  readonly sourceRepository?: string;
  readonly expectedSourceRevision?: string;
}

export interface DoubleTddResult {
  readonly workflowId: "double-tdd";
  readonly proposalArtifact: string;
}
