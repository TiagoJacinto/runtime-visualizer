import { AnalyzeProject } from "./index.ts";
import { BrowserAnalysisWorker } from "./browser-analysis-worker.ts";
import { BrowserAnalysisGateway } from "./browser-analysis-gateway.ts";
import { createEmptyExecutionPort } from "./empty-execution.ts";
import { createEmptyWorkspaceEvents } from "./empty-workspace-events.ts";
import { IndexedDbRevisionHistory } from "../revision-history/index.ts";
import { BrowserProjects } from "../project-files/browser-projects.ts";
import { FileSystemProjectFiles } from "../project-files/file-system-project-files.ts";
import { IndexedDbProjectStore } from "../project-files/indexed-db-project-store.ts";
import type { ProjectId } from "../project-files/index.ts";
import type { LiveWorkspacePorts } from "../../pages/liveWorkspace/useCases/live-workspace.ports.ts";

export const createBrowserWorkspacePorts = (projectId: ProjectId): LiveWorkspacePorts => {
  const projects = new BrowserProjects(new IndexedDbProjectStore());
  const files = new FileSystemProjectFiles(projects);
  const revisions = new IndexedDbRevisionHistory();
  const worker = new BrowserAnalysisWorker();
  const analysis = new AnalyzeProject(files, worker, revisions);
  return {
    analysis: new BrowserAnalysisGateway(analysis, projectId),
    dispose: () => worker.dispose(),
    execution: createEmptyExecutionPort(),
    preferences: undefined,
    projectId,
    workspaceEvents: createEmptyWorkspaceEvents(),
  };
};
