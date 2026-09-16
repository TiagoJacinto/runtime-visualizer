import type {
  RevisionKey,
  WorkspaceEvent,
} from "@runtime-visualizer/contracts";
import { describe, expect, it } from "vitest";

import { reduceWorkspace } from "../../../src/pages/liveWorkspace/useCases/live-workspace.reducer";
import {
  initialLiveWorkspaceState,
  type ExecutionRecord,
  type LiveWorkspaceState,
} from "../../../src/pages/liveWorkspace/useCases/live-workspace.types";

const scope: RevisionKey = {
  file: "main.ts",
  procedureId: "function:run",
  revision: "revision-1",
};
const execution: ExecutionRecord = {
  currentNodeId: null,
  displayNumber: 4,
  error: null,
  executionId: "execution-1",
  file: scope.file,
  procedure: scope.procedureId,
  revision: scope.revision,
  scope,
  startedAt: "2025-01-01T00:00:00.000Z",
  status: "running",
};

const reduce = (
  state: LiveWorkspaceState,
  event: Parameters<typeof reduceWorkspace>[1]
): LiveWorkspaceState => reduceWorkspace(state, event).state;

describe("live workspace local interaction reducer", () => {
  it("restores a saved scope without putting server resources in local state", () => {
    const next = reduce(initialLiveWorkspaceState, {
      importsVisible: false,
      scope,
      type: "preferences-loaded",
    });
    expect(next.selectedScope).toEqual(scope);
    expect(next.importsVisible).toBe(false);
    expect(next).not.toHaveProperty("files");
    expect(next).not.toHaveProperty("revisions");
    expect(next).not.toHaveProperty("analysis");
  });

  it("keeps a changed source queued while its pinned run is active", () => {
    const selected = reduce(initialLiveWorkspaceState, {
      key: scope,
      type: "select-scope",
    });
    const changed = reduce(selected, {
      activeForScope: true,
      event: {
        change: {
          change: "modified",
          file: scope.file,
          revision: "revision-2",
          type: "file-changed",
        },
        type: "source-change",
      } satisfies WorkspaceEvent,
      id: 2,
      type: "workspace-event",
    });
    expect(changed.queuedRevision).toBe("revision-2");
    expect(changed.selectedScope).toEqual(scope);
  });

  it("marks a selected file deleted while one of its runs is active", () => {
    const selected = reduce(initialLiveWorkspaceState, {
      key: scope,
      type: "select-scope",
    });
    const deleted = reduce(selected, {
      activeForFile: true,
      event: {
        change: { change: "deleted", file: scope.file, type: "file-changed" },
        type: "source-change",
      } satisfies WorkspaceEvent,
      id: 3,
      type: "workspace-event",
    });
    expect(deleted.fileDeleted).toBe(true);
    expect(deleted.errorMessage).toBe("File deleted");
  });

  it("requires a second cancel action and rolls back failed cancellation", () => {
    const armed = reduce(initialLiveWorkspaceState, {
      executionId: execution.executionId,
      type: "arm-cancel",
    });
    const confirmedTransition = reduceWorkspace(armed, {
      active: true,
      executionId: execution.executionId,
      type: "confirm-cancel",
    });
    expect(confirmedTransition.effects).toEqual([
      { executionId: execution.executionId, type: "cancel-execution" },
    ]);
    expect(confirmedTransition.state.cancellation.pendingById).toEqual({
      [execution.executionId]: true,
    });
    const rolledBack = reduce(confirmedTransition.state, {
      error: "Network unavailable",
      executionId: execution.executionId,
      type: "cancel-failed",
    });
    expect(rolledBack.cancellation.pendingById).toEqual({});
    expect(rolledBack.errorMessage).toBe("Network unavailable");
  });

  it("keeps the stream connected while resources resynchronize", () => {
    const next = reduce(
      {
        ...initialLiveWorkspaceState,
        connectionState: { cursor: 8, status: "connected" },
      },
      {
        event: { type: "resync-required" },
        id: 8,
        type: "workspace-event",
      }
    );
    expect(next.connectionState).toEqual({ cursor: 8, status: "connected" });
  });

  it("retains terminal results locally after the query removes the active run", () => {
    const next = reduce(initialLiveWorkspaceState, {
      execution: { ...execution, error: "boom", status: "failed" },
      type: "execution-finished",
    });
    expect(next.completedExecutions).toEqual([
      { ...execution, error: "boom", status: "failed" },
    ]);
  });
});
