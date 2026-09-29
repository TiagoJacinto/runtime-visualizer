import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import type {
  AnalysisResponse,
  RevisionSummary,
} from "../../../src/modules/analysis/index.ts";
import type { ExecutionUpdate } from "../../../src/modules/execution/index.ts";
import { afterAll, expect } from "vitest";

import { LiveWorkspaceController } from "../../../src/pages/liveWorkspace/useCases/live-workspace.controller";
import type {
  LiveWorkspacePorts,
  LocalWorkspaceChange,
} from "../../../src/pages/liveWorkspace/useCases/live-workspace.ports";
import type { LiveWorkspaceUpdate } from "../../../src/pages/liveWorkspace/useCases/live-workspace.types";

const featurePath = new URL(
  "../../../../features/live-workspace-resource-lifecycle.feature",
  import.meta.url
).pathname;
const feature = await loadFeature(
  featurePath.startsWith("/@fs/") ? featurePath.slice(4) : featurePath
);

const firstRevision = "revision-1";
const newestRevision = "revision-2";
const scope = {
  file: "main.ts",
  procedureId: "top-level",
  revision: firstRevision,
};

const analysisFor = (revision: string): AnalysisResponse => ({
  cfg: {
    filePath: "main.ts",
    functions: [],
    procedures: [
      {
        entry: "entry",
        exit: "exit",
        name: "Top level",
        nodes: [
          { id: "entry", kind: "entry", label: "Entry" },
          { id: "work", kind: "statement", label: "work()" },
        ],
        edges: [{ from: "entry", to: "work" }],
      },
    ],
  },
  diagnostics: [],
  file: "main.ts",
  procedure: {
    id: "top-level",
    kind: "TopLevel",
    label: "Top level",
    name: null,
  },
  procedureId: "top-level",
  procedures: [
    { id: "top-level", kind: "TopLevel", label: "Top level", name: null },
  ],
  revision,
  source: `export function run() { return "${revision}"; }`,
});

const revisionSummary = (revision: string): RevisionSummary => ({
  analyzedAt: "2025-01-01T00:00:00.000Z",
  diagnosticCount: 0,
  file: "main.ts",
  procedureId: "top-level",
  revision,
  runnable: true,
});

class LocalChangesSpy {
  private readonly pending: LiveWorkspaceUpdate[] = [];
  private readonly waiters: Array<
    (result: IteratorResult<LocalWorkspaceChange>) => void
  > = [];

  push(event: LiveWorkspaceUpdate): void {
    const waiter = this.waiters.shift();
    if (waiter === undefined) {
      this.pending.push(event);
    } else {
      waiter({ done: false, value: { event, kind: "event" } });
    }
  }

  async *watch(signal: AbortSignal): AsyncGenerator<LocalWorkspaceChange> {
    yield { kind: "ready" };
    while (!signal.aborted) {
      const event = this.pending.shift();
      if (event !== undefined) {
        yield { event, kind: "event" };
        continue;
      }
      const result = await new Promise<IteratorResult<LocalWorkspaceChange>>(
        (resolve) => {
          this.waiters.push(resolve);
          signal.addEventListener(
            "abort",
            () => resolve({ done: true, value: undefined }),
            { once: true }
          );
        }
      );
      if (result.done) {
        return;
      }
      yield result.value;
    }
  }
}

class ExecutionUpdatesSpy {
  private readonly listeners = new Set<(update: ExecutionUpdate) => void>();

  subscribe(listener: (update: ExecutionUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  push(update: ExecutionUpdate): void {
    for (const listener of this.listeners) {
      listener(update);
    }
  }
}

const settle = async (): Promise<void> => {
  for (let index = 0; index < 6; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

let controller: LiveWorkspaceController | undefined;
let events: LocalChangesSpy | undefined;
let executionUpdates: ExecutionUpdatesSpy | undefined;
let currentRevision = firstRevision;

afterAll(() => {
  controller?.dispose();
  controller = undefined;
  events = undefined;
  executionUpdates = undefined;
  currentRevision = firstRevision;
});

describeFeature(feature, ({ Scenario }) => {
  Scenario(
    "Queue a newer revision during an active Execution",
    ({ Given, When, Then, And }) => {
      const createPorts = (
        localChanges: LocalChangesSpy,
        updates: ExecutionUpdatesSpy
      ): LiveWorkspacePorts => ({
        analysis: {
          analyse: async () => analysisFor(currentRevision),
          listFiles: async () => ["main.ts"],
          listRevisions: async () => [revisionSummary(currentRevision)],
          load: async (key) => analysisFor(key.revision),
        },
        execution: {
          cancel: async () => undefined,
          list: async () => [],
          start: async () => "execution-1",
        },
        localChanges: { watch: (signal) => localChanges.watch(signal) },
        localExecutionUpdates: updates,
      });

      Given(
        'the selected Procedure is displayed at revision "revision-1"',
        async () => {
          events = new LocalChangesSpy();
          executionUpdates = new ExecutionUpdatesSpy();
          controller = new LiveWorkspaceController(
            createPorts(events, executionUpdates)
          );
          controller.start();
          await settle();
          expect(controller.getState().selection).toMatchObject({
            scope: { revision: firstRevision },
            status: "selected",
          });
        }
      );

      And('an Execution is active for revision "revision-1"', async () => {
        controller?.runProcedure();
        await settle();
        expect(controller?.queries.getActiveExecutions()).toHaveLength(1);
      });

      When(
        'the open project detects revision "revision-2" for the selected file',
        async () => {
          currentRevision = newestRevision;
          events?.push({
            change: {
              change: "modified",
              file: "main.ts",
              revision: newestRevision,
              type: "file-changed",
            },
            type: "source-change",
          });
          events?.push({
            revision: revisionSummary(newestRevision),
            type: "revision-ready",
          });
          await settle();
        }
      );

      Then('the displayed Procedure remains at revision "revision-1"', () => {
        expect(controller?.getState().selection).toMatchObject({
          scope: { revision: firstRevision },
          status: "selected",
        });
        expect(
          controller?.queries.getAnalysis({ ...scope, revision: firstRevision })
            ?.revision
        ).toBe(firstRevision);
      });

      And("the workspace reports that an update is queued", () => {
        expect(controller?.getState().queuedRevision).toBe(newestRevision);
      });

      When("the Execution finishes", async () => {
        executionUpdates?.push({
          currentNodeId: null,
          displayNumber: 1,
          executionId: "execution-1",
          scope,
          status: "Succeeded",
        });
        await settle();
      });

      Then('revision "revision-2" is available for the selected Procedure', () => {
        expect(controller?.getState().selection).toMatchObject({
          scope: { revision: newestRevision },
          status: "selected",
        });
      });
    }
  );
});
