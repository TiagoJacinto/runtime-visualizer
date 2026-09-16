import type {
  AnalysisResponse,
  ActiveExecution,
} from "@runtime-visualizer/contracts";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  createLiveWorkspaceQueries,
  liveWorkspaceQueryKeys,
} from "../../../src/pages/liveWorkspace/useCases/live-workspace.query";

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
      queries.client.getQueryState(liveWorkspaceQueryKeys.files())?.isInvalidated
    ).toBe(true);
    expect(
      queries.client.getQueryState(
        liveWorkspaceQueryKeys.currentAnalysis(
          scope.file,
          scope.procedureId
        )
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
