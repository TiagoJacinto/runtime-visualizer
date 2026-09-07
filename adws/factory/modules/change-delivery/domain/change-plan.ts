export interface ChangePlan {
  readonly summary: string;
  readonly files: readonly string[];
  readonly verification: readonly string[];
}
