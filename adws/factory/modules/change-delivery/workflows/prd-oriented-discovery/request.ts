export interface PrdOrientedDiscoveryRequest {
  readonly prompt: string;
  readonly sourceRepository?: string;
  readonly expectedSourceRevision?: string;
}

export interface PrdOrientedDiscoveryResult {
  readonly workflowId: "prd-oriented-discovery";
  readonly proposalArtifact: string;
}
