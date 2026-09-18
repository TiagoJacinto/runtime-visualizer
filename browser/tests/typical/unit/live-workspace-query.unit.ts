import type {
  AnalysisResponse,
  ActiveExecution,
  RevisionSummary,
} from "@runtime-visualizer/contracts";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  createLiveWorkspaceQueries,
  liveWorkspaceQueryKeys,
  projectLiveWorkspaceView,
} from "../../../src/pages/liveWorkspace/useCases/live-workspace.query";
import type { UseLiveWorkspaceResourcesResult } from "../../../src/pages/liveWorkspace/useCases/live-workspace.query";
import { initialLiveWorkspaceState } from "../../../src/pages/liveWorkspace/useCases/live-workspace.types";
import type { ExecutionRecord } from "../../../src/pages/liveWorkspace/useCases/live-workspace.types";

const scope = {
  file: "main.ts",
  procedureId: "function:run",
  revision: "revision-1",
};
const analysis: AnalysisResponse = {
  cfg: null,
  diagnostics: [],
  file: scope.file,
  procedure: {
    id: scope.procedureId,
    kind: "Function",
    label: "run",
    name: "run",
  },
  procedureId: scope.procedureId,
  procedures: [
    {
      id: scope.procedureId,
      kind: "Function",
      label: "run",
      name: "run",
    },
  ],
  revision: scope.revision,
  source: "function run() {}",
};
const active: ActiveExecution = {
  currentNodeId: "work",
  displayNumber: 1,
  executionId: "execution-1",
  scope,
  startedAt: "2025-01-01T00:00:00.000Z",
  status: "Running",
};
const revisionSummary: RevisionSummary = {
  ...scope,
  analyzedAt: "2025-01-01T00:00:00.000Z",
  diagnosticCount: 0,
  runnable: true,
};
const activeRecord: ExecutionRecord = {
  ...active,
  error: null,
  file: scope.file,
  procedure: scope.procedureId,
  revision: scope.revision,
  status: "running",
};
const makeResources = (
  overrides: Partial<UseLiveWorkspaceResourcesResult> = {}
): UseLiveWorkspaceResourcesResult => ({
  activeExecutions: [],
  analysis: null,
  analysisError: null,
  analysisStatus: "empty",
  files: [],
  filesError: null,
  filesLoading: false,
  revisions: [],
  ...overrides,
});

function createQueries() {
  const load = vi.fn(async () => analysis);
  const listRevisions = vi.fn(async () => [
    {
      ...scope,
      analyzedAt: "2025-01-01T00:00:00.000Z",
      diagnosticCount: 0,
      runnable: true,
    },
  ]);
  const queries = createLiveWorkspaceQueries(
    {
      analysis: {
        analyse: async () => analysis,
        listFiles: async () => [scope.file],
        listRevisions,
        load,
      },
      execution: {
        cancel: async () => undefined,
        list: async () => [],
        start: async () => "execution-2",
      },
    },
    new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return { listRevisions, load, queries };
}

describe("live workspace query ownership", () => {
  it("caches immutable analysis by its content-addressed revision", async () => {
    const { load, queries } = createQueries();
    await queries.fetchAnalysis(scope);
    await queries.fetchAnalysis(scope);
    expect(load).toHaveBeenCalledTimes(1);
    expect(queries.getAnalysis(scope)).toEqual(analysis);
  });

  it("invalidates mutable resources without invalidating immutable analysis", async () => {
    const { listRevisions, queries } = createQueries();
    await queries.fetchAnalysis(scope);
    await queries.fetchRevisions(scope);
    queries.applyWorkspaceEvent({
      change: {
        change: "modified",
        file: scope.file,
        revision: "revision-2",
        type: "file-changed",
      },
      type: "source-change",
    });
    expect(
      queries.client.getQueryState(liveWorkspaceQueryKeys.analysis(scope))
        ?.isInvalidated
    ).toBe(false);
    expect(
      queries.client.getQueryState(liveWorkspaceQueryKeys.revisions(scope))
        ?.isInvalidated
    ).toBe(true);
    await queries.fetchRevisions(scope);
    expect(listRevisions).toHaveBeenCalledTimes(2);
  });

  it("invalidates every mutable resource during resynchronization", async () => {
    const { queries } = createQueries();
    await queries.fetchFiles();
    await queries.fetchCurrentAnalysis(scope.file, scope.procedureId);
    await queries.fetchRevisions(scope);
    await queries.fetchActiveExecutions();

    queries.applyWorkspaceEvent({ type: "resync-required" });
    await queries.invalidateMutableResources();

    expect(
      queries.client.getQueryState(liveWorkspaceQueryKeys.files())
        ?.isInvalidated
    ).toBe(true);
    expect(
      queries.client.getQueryState(
        liveWorkspaceQueryKeys.currentAnalysis(scope.file, scope.procedureId)
      )?.isInvalidated
    ).toBe(true);
    expect(
      queries.client.getQueryState(liveWorkspaceQueryKeys.revisions(scope))
        ?.isInvalidated
    ).toBe(true);
    expect(
      queries.client.getQueryState(liveWorkspaceQueryKeys.activeExecutions())
        ?.isInvalidated
    ).toBe(true);
  });

  it("handles file-cache and revision events across populated and empty caches", async () => {
    const { queries } = createQueries();
    await queries.fetchFiles();
    queries.applyWorkspaceEvent({
      change: { change: "added", file: "new.ts", type: "file-changed" },
      type: "source-change",
    });
    queries.applyWorkspaceEvent({
      change: { change: "added", file: "new.ts", type: "file-changed" },
      type: "source-change",
    });
    queries.applyWorkspaceEvent({
      change: { change: "deleted", file: "new.ts", type: "file-changed" },
      type: "source-change",
    });
    await queries.fetchRevisions(scope);
    queries.applyWorkspaceEvent({
      revision: revisionSummary,
      type: "revision-ready",
    });
    queries.applyWorkspaceEvent({
      error: "build failed",
      paths: [scope.file],
      type: "revision-build-failed",
    });
    expect(queries.getFiles()).toEqual([scope.file]);
    expect(
      queries.client.getQueryState(liveWorkspaceQueryKeys.revisions(scope))
        ?.isInvalidated
    ).toBe(true);

    const empty = createQueries().queries;
    empty.applyWorkspaceEvent({
      change: { change: "added", file: "new.ts", type: "file-changed" },
      type: "source-change",
    });
    empty.applyWorkspaceEvent({
      change: { change: "deleted", file: "new.ts", type: "file-changed" },
      type: "source-change",
    });
  });

  it("starts a run with the next display number and forwards cancellation", async () => {
    const start = vi.fn(async () => "execution-2");
    const cancel = vi.fn(async () => undefined);
    const queries = createLiveWorkspaceQueries(
      {
        analysis: {
          analyse: async () => analysis,
          listFiles: async () => [scope.file],
          listRevisions: async () => [revisionSummary],
          load: async () => analysis,
        },
        execution: {
          cancel,
          list: async () => [],
          start,
        },
      },
      new QueryClient({ defaultOptions: { queries: { retry: false } } })
    );

    const started = await queries.startExecution(scope);
    await queries.cancelExecution(started.executionId);
    expect(start).toHaveBeenCalledWith(scope);
    expect(started.displayNumber).toBe(1);
    expect(cancel).toHaveBeenCalledWith("execution-2");
  });

  it("projects query resources into the expected workspace panes", () => {
    const loading = projectLiveWorkspaceView(
      initialLiveWorkspaceState,
      makeResources({
        files: [scope.file],
        filesLoading: true,
        analysisStatus: "loading",
      })
    );
    expect(loading).toMatchObject({
      pane: { status: "loading" },
      status: "loading",
    });

    const ready = projectLiveWorkspaceView(
      initialLiveWorkspaceState,
      makeResources({
        activeExecutions: [
          activeRecord,
          { ...activeRecord, displayNumber: undefined },
        ],
        analysis,
        analysisStatus: "ready",
        files: [scope.file],
      })
    );
    expect(ready).toMatchObject({ pane: { status: "ready" }, status: "ready" });
    expect(ready.executions).toHaveLength(2);

    const failed = projectLiveWorkspaceView(
      initialLiveWorkspaceState,
      makeResources({
        analysisError: null,
        analysisStatus: "failed",
        files: [scope.file],
      })
    );
    expect(failed).toMatchObject({
      pane: { error: "Analysis unavailable.", status: "failed" },
      status: "error",
    });

    const errored = projectLiveWorkspaceView(
      { ...initialLiveWorkspaceState, errorMessage: "Workspace unavailable" },
      makeResources({ files: [scope.file] })
    );
    expect(errored.error).toBe("Workspace unavailable");
    expect(
      projectLiveWorkspaceView(initialLiveWorkspaceState, makeResources())
        .status
    ).toBe("empty");
  });

  it("owns active execution updates and returns terminal results to local history", () => {
    const { queries } = createQueries();
    queries.applyWorkspaceEvent({
      executions: [active],
      type: "active-executions",
    });
    const result = queries.applyWorkspaceEvent({
      type: "execution-update",
      update: {
        ...active,
        currentNodeId: null,
        error: "boom",
        status: "Failed",
      },
    });
    expect(result.terminal?.executionId).toBe(active.executionId);
    expect(queries.getActiveExecutions()).toEqual([]);
  });
});
