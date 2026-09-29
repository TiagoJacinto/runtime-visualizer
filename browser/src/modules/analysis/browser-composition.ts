import type {
  LiveWorkspacePorts,
  LocalWorkspaceChange,
} from "../../pages/liveWorkspace/useCases/live-workspace.ports.ts";
import type { LiveWorkspaceUpdate } from "../../pages/liveWorkspace/useCases/live-workspace.types.ts";
import { createLocalExecution } from "../execution/index.ts";
import { BrowserProjects } from "../project-files/browser-projects.ts";
import { FileSystemProjectFiles } from "../project-files/file-system-project-files.ts";
import type { ProjectId } from "../project-files/index.ts";
import { IndexedDbProjectStore } from "../project-files/indexed-db-project-store.ts";
import { IndexedDbRevisionHistory } from "../revision-history/index.ts";
import { BrowserAnalysisGateway } from "./browser-analysis-gateway.ts";
import { BrowserAnalysisWorker } from "./browser-analysis-worker.ts";
import { AnalyzeProject } from "./index.ts";
import type { AnalysisSnapshot, RevisionSummary } from "./index.ts";

const revisionSummary = (snapshot: AnalysisSnapshot): RevisionSummary => ({
  analyzedAt: snapshot.analyzedAt,
  diagnosticCount: snapshot.diagnostics.length,
  file: snapshot.file,
  procedureId: snapshot.procedureId,
  revision: snapshot.revision,
  runnable: snapshot.cfg !== null && snapshot.diagnostics.length === 0,
});

const localChanges = (
  projectId: ProjectId,
  files: FileSystemProjectFiles,
  analysis: AnalyzeProject
): NonNullable<LiveWorkspacePorts["localChanges"]> => ({
  watch: (signal) =>
    (async function* watchChanges(): AsyncIterable<LocalWorkspaceChange> {
      for await (const observation of files.watchChanges(projectId, signal)) {
        if (observation.type === "ready") {
          yield { kind: "ready" };
          continue;
        }
        const snapshots = await analysis.applySourceChanges(
          projectId,
          observation.changes
        );
        for (const change of observation.changes) {
          const event: LiveWorkspaceUpdate = {
            change: {
              change: change.change,
              file: change.file,
              type: "file-changed",
            },
            type: "source-change",
          };
          yield { event, kind: "event" };
        }
        for (const snapshot of snapshots) {
          const event: LiveWorkspaceUpdate = {
            revision: revisionSummary(snapshot),
            type: "revision-ready",
          };
          yield { event, kind: "event" };
        }
      }
    })(),
});

export const createBrowserWorkspacePorts = (
  projectId: ProjectId
): LiveWorkspacePorts => {
  const projects = new BrowserProjects(new IndexedDbProjectStore());
  const files = new FileSystemProjectFiles(projects);
  const revisions = new IndexedDbRevisionHistory();
  const worker = new BrowserAnalysisWorker();
  const analysis = new AnalyzeProject(files, worker, revisions);
  const execution = createLocalExecution(revisions, projectId);
  return {
    analysis: new BrowserAnalysisGateway(analysis, projectId),
    dispose: () => {
      execution.dispose();
      worker.dispose();
    },
    execution,
    localChanges: localChanges(projectId, files, analysis),
    localExecutionUpdates: execution,
    projectId,
  };
};
