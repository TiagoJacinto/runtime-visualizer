export interface ValidationResult {
  readonly passed: boolean;
  readonly command?: string;
  readonly output?: string;
  readonly failures?: readonly string[];
}
