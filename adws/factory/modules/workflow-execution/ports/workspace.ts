import type { SourceIntegrity } from "../domain/workflow";

export interface SourceState {
  readonly repository: string;
  readonly revision: string;
  readonly workingTree: "Clean" | "Dirty";
}

export interface WorkspaceLease {
  readonly path: string;
  readonly source: SourceState;
  readonly isolation: "IndependentClone";
  retain(): void;
  dispose(): void;
}

export interface WorkspacePort {
  inspect(repository: string): SourceState;
  create(
    repository: string,
    destination: string,
    expectedRevision: string,
  ): WorkspaceLease;
}

export type { SourceIntegrity };
