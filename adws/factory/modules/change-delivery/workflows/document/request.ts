export interface DocumentRequest {
  readonly prompt: string;
  readonly sourceRepository?: string;
  readonly expectedSourceRevision?: string;
}

export interface DocumentResult {
  readonly workflowId: "document";
  readonly proposalArtifact: string;
}
