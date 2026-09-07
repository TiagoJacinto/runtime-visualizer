export interface ReviewClaim {
  readonly claim: string;
  readonly evidence: readonly string[];
}
export interface ReviewResult {
  readonly passed: boolean;
  readonly claims: readonly ReviewClaim[];
  readonly violations: readonly string[];
}
