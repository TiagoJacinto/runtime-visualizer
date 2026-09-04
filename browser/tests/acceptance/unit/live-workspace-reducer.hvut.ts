import { describe, expect, it } from "vitest";
import type { ActiveExecution, AnalysisResponse } from "@runtime-visualizer/contracts";
import {
  initialLiveWorkspaceState,
  type LiveWorkspaceState,
} from "../../../src/pages/liveWorkspace/useCases/liveWorkspace.types";
import { reduceWorkspace } from "../../../src/pages/liveWorkspace/useCases/liveWorkspace.reducer";

const scope = {
  file: "main.ts",
  procedureId: "function:run",
  revision: "revision-1",
};

const analysis: AnalysisResponse = {
  file: scope.file,
  procedure: { id: scope.procedureId, kind: "Function", name: "run", label: "run" },
  procedureId: scope.procedureId,
  revision: scope.revision,
  source: "function run() {}",
  procedures: [{ id: scope.procedureId, kind: "Function", name: "run", label: "run" }],
  cfg: null,
  diagnostics: [],
};

function active(executionId = "execution-1"): ActiveExecution {
  return {
    executionId,
    displayNumber: 4,
    scope,
    startedAt: "2025-01-01T00:00:00.000Z",
    status: "Running",
    currentNodeId: null,
  };
}

function reduce(
  state: LiveWorkspaceState,
  event: Parameters<typeof reduceWorkspace>[1],
): LiveWorkspaceState {
  return reduceWorkspace(state, event).state;
}

describe("live workspace reducer", () => {
  it("falls back to the newest available revision without replacing a valid scope implicitly", () => {
    const saved = reduce(initialLiveWorkspaceState, {
      type: "preferences-loaded",
      scope,
      importsVisible: true,
    });
    const listed = reduce(saved, { type: "files-loaded", files: ["main.ts"] });
    const nextRevision = { ...scope, revision: "revision-2" };
    const next = reduce(listed, {
      type: "revisions-loaded",
      scope: { file: scope.file, procedureId: scope.procedureId },
      revisions: [{
        file: scope.file,
        procedureId: scope.procedureId,
        revision: nextRevision.revision,
        analyzedAt: "2025-01-02T00:00:00.000Z",
        runnable: true,
        diagnosticCount: 0,
      }],
    });
    expect(next.selectedScope).toEqual(nextRevision);
    expect(next.executions).toEqual([]);
  });

  it("ignores stale analysis responses after a newer request starts", () => {
    const loading = reduce(initialLiveWorkspaceState, {
      type: "analysis-loading",
      key: scope,
      requestId: "new",
    });
    const stale = reduce(loading, {
      type: "analysis-loaded",
      key: scope,
      requestId: "old",
      value: analysis,
    });
    expect(stale).toBe(loading);
    const current = reduce(loading, {
      type: "analysis-loaded",
      key: scope,
      requestId: "new",
      value: analysis,
    });
    expect(current.analysis).toEqual(analysis);
  });

  it("hydrates active runs and rolls cancellation back when transport fails", () => {
    const hydrated = reduce(initialLiveWorkspaceState, {
      type: "workspace-event",
      id: 8,
      event: { type: "active-executions", executions: [active()] },
    });
    expect(hydrated.activeExecutionsById["execution-1"]?.scope).toEqual(scope);
    const armed = reduce(hydrated, { type: "arm-cancel", executionId: "execution-1" });
    const confirmedTransition = reduceWorkspace(armed, { type: "confirm-cancel", executionId: "execution-1" });
    const confirmed = confirmedTransition.state;
    expect(confirmed.activeExecutionsById["execution-1"]).toBeDefined();
    expect(confirmed.cancellation.pendingById["execution-1"]).toBe(true);
    expect(confirmedTransition.effects).toEqual([{ type: "cancel-execution", executionId: "execution-1" }]);
    const rolledBack = reduce(confirmed, {
      type: "cancel-failed",
      executionId: "execution-1",
      error: "Network unavailable",
    });
    expect(rolledBack.activeExecutionsById["execution-1"]).toBeDefined();
    expect(rolledBack.cancellation.pendingById["execution-1"]).toBeUndefined();
    expect(rolledBack.error).toBe("Network unavailable");
  });

  it("keeps a changed source queued while its pinned run is active", () => {
    const loading = reduce(initialLiveWorkspaceState, {
      type: "analysis-loading",
      key: scope,
      requestId: "request",
    });
    const withScope = reduce(loading, {
      type: "analysis-loaded",
      key: scope,
      requestId: "request",
      value: analysis,
    });
    const running = reduce(withScope, {
      type: "workspace-event",
      id: 1,
      event: { type: "active-executions", executions: [active()] },
    });
    const changed = reduce(running, {
      type: "workspace-event",
      id: 2,
      event: {
        type: "source-change",
        change: {
          type: "file-changed",
          file: "main.ts",
          change: "modified",
          revision: "revision-2",
        },
      },
    });
    expect(changed.queuedRevision).toBe("revision-2");
    expect(changed.selectedScope).toEqual(scope);
  });
});
