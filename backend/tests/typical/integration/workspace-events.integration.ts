import { describe, expect, it } from "vitest";
import { WorkspaceEventHub } from "../../../src/modules/workspace/eventHub.ts";
import { WorkspaceEventSchema } from "../../../../packages/contracts/src/workspace-events.ts";

describe("workspace event hub", () => {
  it("assigns ordered IDs, hydrates active clients, and replays retained events", () => {
    const hub = new WorkspaceEventHub(4);
    const active = {
      executionId: "run-1",
      displayNumber: 1,
      scope: { file: "main.ts", procedureId: "top-level", revision: "r1" },
      startedAt: new Date().toISOString(),
      status: "Running" as const,
      currentNodeId: null,
    };
    const first = hub.publish({
      type: "active-executions",
      executions: [active],
    });
    const second = hub.publish({
      type: "revision-ready",
      revision: {
        file: "main.ts",
        procedureId: "top-level",
        revision: "r1",
        analyzedAt: new Date().toISOString(),
        runnable: true,
        diagnosticCount: 0,
      },
    });
    expect(first).toBe(1);
    expect(second).toBe(2);
    const subscription = hub.subscribe(0);
    expect(subscription.replay.map((record) => record.id)).toEqual([1, 2]);
    expect(subscription.replay[0]?.event).toMatchObject({
      type: "active-executions",
      executions: [active],
    });
    expect(
      WorkspaceEventSchema.safeParse(subscription.replay[1]?.event).success,
    ).toBe(true);
  });

  it("bounds replay and requests resynchronization for an expired cursor", () => {
    const hub = new WorkspaceEventHub(2);
    hub.publish({
      type: "source-change",
      change: {
        type: "file-changed",
        file: "a.ts",
        change: "modified",
        revision: "a",
      },
    });
    hub.publish({
      type: "source-change",
      change: {
        type: "file-changed",
        file: "b.ts",
        change: "modified",
        revision: "b",
      },
    });
    hub.publish({
      type: "source-change",
      change: {
        type: "file-changed",
        file: "c.ts",
        change: "added",
        revision: "c",
      },
    });
    const expired = hub.subscribe(0);
    expect(expired.resyncRequired).toBe(true);
    expect(expired.replay).toEqual([]);
    const current = hub.subscribe(2);
    expect(current.resyncRequired).toBe(false);
    expect(current.replay.map((record) => record.event.type)).toEqual([
      "source-change",
    ]);
  });

  it("preserves publication ordering and accepts source-event compatible payloads", () => {
    const hub = new WorkspaceEventHub();
    const seen: number[] = [];
    const subscription = hub.subscribe(undefined, (record) =>
      seen.push(record.id),
    );
    hub.publish({
      type: "source-change",
      change: { type: "file-changed", file: "main.ts", change: "deleted" },
    });
    hub.publish({
      type: "revision-build-failed",
      paths: ["main.ts"],
      error: "analysis failed",
    });
    hub.publish({
      type: "revision-ready",
      revision: {
        file: "main.ts",
        procedureId: "top-level",
        revision: "r2",
        analyzedAt: new Date().toISOString(),
        runnable: false,
        diagnosticCount: 1,
      },
    });
    expect(seen).toEqual([1, 2, 3]);
    subscription.unsubscribe();
  });
});
