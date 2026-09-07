export interface PrdOrientedDesignRequest {
  readonly prompt: string;
  readonly sourceRepository?: string;
  readonly expectedSourceRevision?: string;
}

export interface PrdOrientedDesignResult {
  readonly workflowId: "prd-oriented-design";
  readonly proposalArtifact: string;
}
