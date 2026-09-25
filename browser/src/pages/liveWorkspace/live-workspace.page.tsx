import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { BrowserProjects } from "../../modules/project-files/browser-projects";
import { IndexedDbProjectStore } from "../../modules/project-files/indexed-db-project-store";
import { createBrowserWorkspacePorts } from "../../modules/analysis/browser-composition";
import type { AddProjectResult, ProjectId, SavedProject } from "../../modules/project-files";
import { ContextRail } from "./components/contextRail/context-rail";
import type { ProjectNavigationProps } from "./components/contextRail/project-switcher";
import { WorkspaceNotifications } from "./components/notifications/workspace-notifications";
import { ProcedureWorkspace } from "./components/procedureWorkspace/procedure-workspace";
import { WorkspaceHeader } from "./components/workspaceHeader/workspace-header";
import { LiveWorkspaceController } from "./useCases/live-workspace.controller";
import type { WorkspaceController } from "./useCases/live-workspace.ports";
import {
  projectLiveWorkspaceView,
  useLiveWorkspaceResources,
} from "./useCases/live-workspace.query";
import {
  selectRevisionBadge,
  selectVisibleExecutions,
} from "./useCases/live-workspace.selectors";
import { useWorkspaceController } from "./useCases/use-workspace-controller";

const LiveWorkspaceContent = ({
  controller,
  disposeOnUnmount,
  projectNavigation,
}: {
  controller: WorkspaceController;
  disposeOnUnmount: boolean;
  projectNavigation?: ProjectNavigationProps;
}) => {
  const state = useWorkspaceController(controller, disposeOnUnmount);
  const selectedScope =
    state.selection.status === "selected" ? state.selection.scope : null;
  const resources = useLiveWorkspaceResources(controller.queries, selectedScope);
  const view = projectLiveWorkspaceView(state, resources);
  const [railOpen, setRailOpen] = useState(false);
  const displayedScope = view.analysis
    ? {
        file: view.analysis.file,
        procedureId: view.analysis.procedureId,
        revision: view.analysis.revision,
      }
    : view.selectedScope;
  const visibleExecutions = selectVisibleExecutions(view, displayedScope);
  const revisionBadge = selectRevisionBadge(view, displayedScope);
  return (
    <div
      className="h-screen w-full overflow-hidden bg-[#07110E] text-slate-100"
      data-testid="live-workspace"
    >
      <div className="flex h-full w-full flex-col">
        <WorkspaceHeader
          state={view}
          scope={displayedScope}
          onOpenRail={() => setRailOpen(true)}
          localMode={projectNavigation !== undefined}
        />
        <div className="relative flex min-h-0 flex-1">
          {railOpen ? (
            <button
              type="button"
              aria-label="Close workspace navigation overlay"
              onClick={() => setRailOpen(false)}
              className="absolute inset-0 z-20 bg-black/60 focus-visible:outline-2 focus-visible:outline-emerald-200 lg:hidden"
            />
          ) : null}
          <ContextRail
            state={view}
            controller={controller}
            analysis={view.analysis}
            selectedScope={view.selectedScope}
            revisions={view.revisions}
            revisionBadge={revisionBadge}
            open={railOpen}
            onClose={() => setRailOpen(false)}
            projectNavigation={projectNavigation}
            executionAvailable={projectNavigation === undefined}
          />
          <main className="flex min-w-0 flex-1 flex-col overflow-auto bg-[#07110E]">
            <WorkspaceNotifications state={view} controller={controller} />
            {view.status === "empty" ? (
              <output className="px-4 pt-6 text-xs text-slate-500 sm:px-6">
                No supported TypeScript or TSX files found.
              </output>
            ) : null}
            <ProcedureWorkspace
              state={view}
              controller={controller}
              analysis={view.analysis}
              scope={displayedScope}
              visibleExecutions={visibleExecutions}
              revisionBadge={revisionBadge}
            />
          </main>
        </div>
      </div>
    </div>
  );
};

const BrowserProjectWorkspace = ({
  projectId,
  projectNavigation,
}: {
  projectId: ProjectId;
  projectNavigation: ProjectNavigationProps;
}) => {
  const controller = useMemo(
    () => new LiveWorkspaceController(createBrowserWorkspacePorts(projectId)),
    [projectId]
  );
  return (
    <QueryClientProvider client={controller.queries.client}>
      <LiveWorkspaceContent
        controller={controller}
        disposeOnUnmount
        projectNavigation={projectNavigation}
      />
    </QueryClientProvider>
  );
};

const BrowserProjectEntry = () => {
  const projects = useMemo(
    () => new BrowserProjects(new IndexedDbProjectStore()),
    []
  );
  const [saved, setSaved] = useState<readonly SavedProject[]>([]);
  const [projectId, setProjectId] = useState<ProjectId | null>(null);
  const [pendingReselectionId, setPendingReselectionId] =
    useState<ProjectId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const restore = async (): Promise<void> => {
      try {
        const projectsList = await projects.list();
        if (!active) {
          return;
        }
        setSaved(projectsList);
        const [first] = projectsList;
        if (first !== undefined) {
          const access = await projects.get(first.id);
          const permission = await access?.handle.queryPermission?.({ mode: "read" });
          if (!active) {
            return;
          }
          if (permission === "granted") {
            setProjectId(first.id);
          } else {
            setPendingReselectionId(first.id);
            setMessage("Folder access is unavailable. Select the project folder again.");
          }
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Unable to restore saved projects.");
        }
      }
      if (active) {
        setLoading(false);
      }
    };
    void restore();
    return () => {
      active = false;
    };
  }, [projects]);

  const showResult = async (result: AddProjectResult): Promise<void> => {
    if (result.status === "unsupported") {
      setMessage("This browser does not support folder access. Open the workspace in Chromium.");
      return;
    }
    if (result.status !== "opened") {
      return;
    }
    setSaved(await projects.list());
    setPendingReselectionId(null);
    setMessage(null);
    setProjectId(result.project.id);
  };
  const addProject = async (): Promise<void> => {
    try {
      await showResult(await projects.add());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to open that project folder.");
    }
  };
  const reselectProject = async (id: ProjectId): Promise<void> => {
    try {
      await showResult(await projects.reselect(id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reselect that project folder.");
    }
  };
  const openSavedProject = async (id: ProjectId): Promise<void> => {
    try {
      const access = await projects.get(id);
      if (access === undefined) {
        setMessage("This saved project is no longer available. Select its folder again.");
        setPendingReselectionId(id);
        return;
      }
      const permission = await access.handle.queryPermission?.({ mode: "read" });
      const granted = permission === "granted"
        ? permission
        : await access.handle.requestPermission?.({ mode: "read" });
      if (granted !== "granted") {
        setProjectId(null);
        setPendingReselectionId(id);
        setMessage("Folder access is unavailable. Select the project folder again.");
        return;
      }
      setProjectId(id);
      setPendingReselectionId(null);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to open the saved project.");
    }
  };

  if (loading) {
    return <main aria-busy="true" className="grid min-h-screen place-items-center bg-[#07110E] text-sm text-slate-400">Restoring saved projects…</main>;
  }
  if (projectId !== null) {
    const projectNavigation: ProjectNavigationProps = {
      activeProjectId: projectId,
      onAddProject: addProject,
      onSelectProject: openSavedProject,
      projects: saved,
    };
    return (
      <BrowserProjectWorkspace
        key={projectId}
        projectId={projectId}
        projectNavigation={projectNavigation}
      />
    );
  }
  const pendingProject = saved.find((project) => project.id === pendingReselectionId);
  return (
    <main className="grid min-h-screen place-items-center bg-[#07110E] px-6 text-slate-100">
      <section className="w-full max-w-md space-y-5 rounded-xl border border-white/10 bg-[#0A1712] p-8">
        <h1 className="text-xl font-semibold">Open a project folder</h1>
        <p className="text-sm text-slate-400">Select a folder containing TypeScript or TSX files to analyze it locally in your browser.</p>
        {message === null ? null : <p role="alert" className="text-sm text-amber-200">{message}</p>}
        {pendingProject === undefined ? null : (
          <button
            type="button"
            className="block w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm hover:border-emerald-300/50"
            onClick={reselectProject.bind(undefined, pendingProject.id)}
          >
            Re-select {pendingProject.name}
          </button>
        )}
        {saved.filter((project) => project.id !== pendingReselectionId).map((project) => (
          <button
            key={project.id}
            type="button"
            className="block w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm hover:border-emerald-300/50"
            onClick={openSavedProject.bind(undefined, project.id)}
          >
            Open {project.name}
          </button>
        ))}
        <button
          type="button"
          className="w-full rounded-lg bg-emerald-300 px-4 py-3 text-sm font-semibold text-[#06100D]"
          onClick={addProject}
        >
          Select project folder
        </button>
      </section>
    </main>
  );
};

export const LiveWorkspacePage = ({
  controller,
}: {
  controller?: WorkspaceController;
}) => {
  if (controller === undefined) {
    return <BrowserProjectEntry />;
  }
  return (
    <QueryClientProvider client={controller.queries.client}>
      <LiveWorkspaceContent controller={controller} disposeOnUnmount={false} />
    </QueryClientProvider>
  );
};
