export interface ResearchRequest {
  readonly prompt: string;
  readonly sourceRepository?: string;
  readonly expectedSourceRevision?: string;
}

export interface ResearchResult {
  readonly workflowId: "research";
  readonly proposalArtifact: string;
}
