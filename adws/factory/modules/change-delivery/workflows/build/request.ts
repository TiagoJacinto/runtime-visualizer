export interface BuildRequest {
  readonly prompt: string;
  readonly sourceRepository?: string;
  readonly expectedSourceRevision?: string;
}

export interface BuildResult {
  readonly workflowId: "build";
  readonly proposalArtifact: string;
}
