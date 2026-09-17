import { describe, expect, it } from "vitest";

import {
  selectRevisionBadge,
  selectVisibleExecutions,
  selectVisibleMarkers,
} from "../../../src/pages/liveWorkspace/useCases/live-workspace.selectors";
import {
  initialLiveWorkspaceState,
  type LiveWorkspaceView,
} from "../../../src/pages/liveWorkspace/useCases/live-workspace.types";
import { scope } from "./fixtures/graph-source-fixture";

describe("live workspace selectors", () => {
  it("selects markers and revision badges for the displayed scope", () => {
    const execution = {
      executionId: "execution-1",
      displayNumber: 1,
      scope,
      status: "running" as const,
      currentNodeId: "return",
      error: null,
      file: scope.file,
      procedure: scope.procedureId,
      revision: scope.revision,
    };
    const state: LiveWorkspaceView = {
      ...initialLiveWorkspaceState,
      activeExecutions: [execution],
      analysis: null,
      connection: "connected",
      error: null,
      executions: [execution],
      files: [scope.file],
      pane: { status: "empty" },
      revisions: [
        {
          file: scope.file,
          procedureId: scope.procedureId,
          revision: scope.revision,
          analyzedAt: "2025-01-01T00:00:00.000Z",
          runnable: true,
          diagnosticCount: 0,
        },
      ],
      selectedFile: scope.file,
      selectedProcedure: scope.procedureId,
      selectedScope: scope,
      status: "ready",
    };

    expect(selectVisibleExecutions(state, scope)).toEqual([execution]);
    expect(selectVisibleMarkers(state, "return", scope)).toEqual([execution]);
    expect(selectVisibleMarkers(state, "entry", scope)).toEqual([]);
    expect(selectVisibleExecutions(state, null)).toEqual([]);
    expect(selectRevisionBadge(state, scope)?.revision).toBe(scope.revision);
    expect(selectRevisionBadge(state, null)).toBeNull();
  });
});
