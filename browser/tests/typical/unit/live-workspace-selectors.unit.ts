import { describe, expect, it } from "vitest";

import {
  selectRevisionBadge,
  selectVisibleExecutions,
  selectVisibleMarkers,
} from "../../../src/pages/liveWorkspace/useCases/live-workspace.selectors";
import { initialLiveWorkspaceState } from "../../../src/pages/liveWorkspace/useCases/live-workspace.types";
import type { LiveWorkspaceView } from "../../../src/pages/liveWorkspace/useCases/live-workspace.types";
import { scope } from "./fixtures/graph-source-fixture";

describe("live workspace selectors", () => {
  it("selects markers and revision badges for the displayed scope", () => {
    const execution = {
      currentNodeId: "return",
      displayNumber: 1,
      error: null,
      executionId: "execution-1",
      file: scope.file,
      procedure: scope.procedureId,
      revision: scope.revision,
      scope,
      status: "running" as const,
    };
    const state: LiveWorkspaceView = {
      ...initialLiveWorkspaceState,
      activeExecutions: [execution],
      analysis: null,
      error: null,
      executions: [execution],
      files: [scope.file],
      pane: { status: "empty" },
      revisions: [
        {
          analyzedAt: "2025-01-01T00:00:00.000Z",
          diagnosticCount: 0,
          file: scope.file,
          procedureId: scope.procedureId,
          revision: scope.revision,
          runnable: true,
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
