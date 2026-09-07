export interface BuildReviewRequest {
  readonly prompt: string;
  readonly sourceRepository?: string;
  readonly expectedSourceRevision?: string;
}

export interface BuildReviewResult {
  readonly workflowId: "build-review";
  readonly proposalArtifact: string;
}
