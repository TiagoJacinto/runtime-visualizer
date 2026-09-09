import type { ProcedureResource } from "../source/index.ts";
import type { AnalysisSnapshot } from "./revision-history.ts";

export interface RevisionBuildInput {
  file: string;
  procedure: ProcedureResource;
  source: string;
  files: Readonly<Record<string, string>>;
}

export interface RevisionDependencyInput {
  changedPaths: readonly string[];
  files: Readonly<Record<string, string>>;
}

export interface RevisionBuilderWorkerClient {
  build: (input: RevisionBuildInput) => Promise<AnalysisSnapshot>;
  resolveAffectedFiles: (
    input: RevisionDependencyInput
  ) => Promise<readonly string[]>;
  close?: () => Promise<void> | void;
}
