import type { ArtifactStorePort } from "../../ports/artifact-store";
import type {
  EvidenceManifest,
  IntegrationDecision,
  RunSnapshot,
  WorkflowRun,
} from "../../domain/workflow";

export class RunLedger {
  constructor(
    private readonly artifactStore: ArtifactStorePort,
    private readonly now: () => string,
    private readonly runs = new Map<string, RunSnapshot>(),
  ) {}

  persist(run: WorkflowRun): string {
    const path = this.artifactStore.writeManifest(
      run.runIdentifier,
      run.evidenceManifest,
    );
    this.runs.set(run.runIdentifier, this.snapshot(run.evidenceManifest));
    return path;
  }

  inspect(runIdentifier: string): RunSnapshot | undefined {
    const cached = this.runs.get(runIdentifier);
    if (cached) return cached;
    const manifest = this.artifactStore.readManifest(runIdentifier);
    if (!manifest) return undefined;
    const snapshot = this.snapshot(manifest);
    this.runs.set(runIdentifier, snapshot);
    return snapshot;
  }

  decide(
    runIdentifier: string,
    decision: Omit<IntegrationDecision, "decidedAt">,
  ): RunSnapshot {
    const existing = this.inspect(runIdentifier);
    if (!existing) throw new Error(`Workflow run not found: ${runIdentifier}`);
    if (existing.integration)
      throw new Error(
        `Integration decision already recorded: ${runIdentifier}`,
      );
    const integration = { ...decision, decidedAt: this.now() };
    const manifest: EvidenceManifest = {
      ...existing.evidenceManifest,
      integration,
    };
    this.artifactStore.writeManifest(runIdentifier, manifest);
    const snapshot = this.snapshot(manifest);
    this.runs.set(runIdentifier, snapshot);
    return snapshot;
  }

  private snapshot(manifest: EvidenceManifest): RunSnapshot {
    return {
      runIdentifier: manifest.runIdentifier,
      workflowId: manifest.workflowId,
      status: manifest.status,
      evidenceManifest: manifest,
      ...(manifest.source ? { source: manifest.source } : {}),
      ...(manifest.integration ? { integration: manifest.integration } : {}),
    };
  }
}
