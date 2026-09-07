export interface PromptRequest {
  readonly prompt: string;
  readonly agentOwner: string;
}

export interface PromptResult {
  readonly workflowId: "prompt";
  readonly outputArtifact: string;
}
