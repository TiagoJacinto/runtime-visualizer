export interface QualityRequest {
  readonly prompt: string;
  readonly sourceRepository?: string;
  readonly expectedSourceRevision?: string;
}

export interface QualityResult {
  readonly workflowId: "quality";
  readonly proposalArtifact: string;
}
