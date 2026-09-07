import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactStorePort } from "../../ports/artifact-store";
import type { EvidenceManifest } from "../../domain/workflow";

export class FilesystemArtifactStore implements ArtifactStorePort {
  constructor(private readonly root: string) {}
  write(runIdentifier: string, name: string, value: unknown): string {
    const dir = join(this.root, runIdentifier);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, name);
    writeFileSync(
      path,
      typeof value === "string" ? value : JSON.stringify(value, null, 2),
    );
    return path;
  }
  writeManifest(runIdentifier: string, manifest: EvidenceManifest): string {
    return this.write(runIdentifier, "evidence-manifest.json", manifest);
  }
  readManifest(runIdentifier: string): EvidenceManifest | undefined {
    try {
      return JSON.parse(
        readFileSync(
          join(this.root, runIdentifier, "evidence-manifest.json"),
          "utf8",
        ),
      );
    } catch {
      return undefined;
    }
  }
}
