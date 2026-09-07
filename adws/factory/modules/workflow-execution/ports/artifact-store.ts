import type { EvidenceManifest } from "../domain/workflow";

export interface ArtifactStorePort {
  write(runIdentifier: string, name: string, value: unknown): string;
  writeManifest(runIdentifier: string, manifest: EvidenceManifest): string;
  readManifest(runIdentifier: string): EvidenceManifest | undefined;
}
