import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import type {
  ActiveExecution,
  AnalysisResponse,
  RevisionSummary,
  WorkspaceEvent,
} from "@runtime-visualizer/contracts";
import { afterAll, expect } from "vitest";

import { LiveWorkspaceController } from "../../../src/pages/liveWorkspace/useCases/live-workspace.controller";
import type { LiveWorkspacePorts } from "../../../src/pages/liveWorkspace/useCases/live-workspace.ports";

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

const activeExecution = (revision: string): ActiveExecution => ({
  currentNodeId: null,
  displayNumber: 1,
  executionId: "execution-1",
  scope: { ...scope, revision },
  startedAt: "2025-01-01T00:00:00.000Z",
  status: "Running",
});

const revisionSummary = (revision: string): RevisionSummary => ({
  analyzedAt: "2025-01-01T00:00:00.000Z",
  diagnosticCount: 0,
  file: "main.ts",
  procedureId: "top-level",
  revision,
  runnable: true,
});

type EventRecord = { id: number; event: WorkspaceEvent };

class WorkspaceEventsSpy {
  readonly pending: EventRecord[] = [];
  readonly waiters: Array<(result: IteratorResult<EventRecord>) => void> = [];
  closed = false;
  private sequence = 0;

  push(event: WorkspaceEvent): void {
    const record = { event, id: ++this.sequence };
    const waiter = this.waiters.shift();
    if (waiter !== undefined) waiter({ done: false, value: record });
    else this.pending.push(record);
  }

  async *subscribe(signal: AbortSignal): AsyncGenerator<EventRecord> {
    while (!this.closed && !signal.aborted) {
      const pending = this.pending.shift();
      if (pending !== undefined) {
        yield pending;
        continue;
      }
      const result = await new Promise<IteratorResult<EventRecord>>((resolve) => {
        this.waiters.push(resolve);
        signal.addEventListener(
          "abort",
          () => resolve({ done: true, value: undefined }),
          { once: true }
        );
      });
      if (result.done) return;
      yield result.value;
    }
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ done: true, value: undefined });
    }
  }
}

const settle = async (): Promise<void> => {
  for (let index = 0; index < 6; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

let controller: LiveWorkspaceController | undefined;
let events: WorkspaceEventsSpy | undefined;
let currentRevision = firstRevision;

afterAll(() => {
  controller?.dispose();
  events?.close();
  controller = undefined;
  events = undefined;
  currentRevision = firstRevision;
});

describeFeature(feature, ({ Scenario }) => {
  Scenario(
    "Queue a newer revision during an active Execution",
    ({ Given, When, Then, And }) => {

      const createPorts = (eventSource: WorkspaceEventsSpy): LiveWorkspacePorts => ({
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
        workspaceEvents: {
          subscribe: (signal) => eventSource.subscribe(signal),
        },
      });

      Given(
        'the selected Procedure is displayed at revision "revision-1"',
        async () => {
        events = new WorkspaceEventsSpy();
        controller = new LiveWorkspaceController(createPorts(events));
        controller.start();
        await settle();
        expect(controller.getState().selection).toMatchObject({
          scope: { revision: firstRevision },
          status: "selected",
        });
      });

      And('an Execution is active for revision "revision-1"', async () => {
        controller?.runProcedure();
        await settle();
        events?.push({
          executions: [activeExecution(firstRevision)],
          type: "active-executions",
        });
        await settle();
      });

      When(
        'the server announces revision "revision-2" for the selected file',
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
        await settle();
      });

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
        events?.push({
          type: "execution-update",
          update: {
            ...activeExecution(firstRevision),
            currentNodeId: null,
            status: "Succeeded",
          },
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
