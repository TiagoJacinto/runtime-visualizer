export interface Envelope<T = unknown> {
  readonly outputType: string;
  readonly claims: readonly string[];
  readonly payload: T;
  readonly artifactReferences: readonly string[];
  readonly trusted: false;
}

export interface GateReport {
  readonly gateId: string;
  readonly passed: boolean;
  readonly claims: readonly string[];
  readonly violations: readonly string[];
  readonly checks: readonly string[];
}

export type { Artifact } from "./workflow";
