import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import type {
  ActiveExecution,
  AnalysisResponse,
  ExecutionUpdate,
  RevisionKey,
  RevisionSummary,
} from "@runtime-visualizer/contracts";
import { afterAll, expect } from "vitest";

import { LiveWorkspaceController } from "../../../src/pages/liveWorkspace/useCases/live-workspace.controller";
import type { LiveWorkspacePorts } from "../../../src/pages/liveWorkspace/useCases/live-workspace.ports";

const featurePath = new URL(
  "../../../../features/execute-selected-revision.feature",
  import.meta.url
).pathname;
const feature = await loadFeature(
  featurePath.startsWith("/@fs/") ? featurePath.slice(4) : featurePath
);

const file = "src/main.ts";
const procedureId = "function:run";
const startedAt = "2026-09-25T00:00:00.000Z";

const analysisFor = (revision: string): AnalysisResponse => {
  const nodeId = `node-${revision}`;
  const label = revision === "revision-1" ? "oldBehavior()" : "newBehavior()";
  return {
    cfg: {
      filePath: file,
      functions: [],
      procedures: [
        {
          edges: [
            { from: "entry", to: nodeId },
            { from: nodeId, to: "exit" },
          ],
          entry: "entry",
          exit: "exit",
          name: "run",
          nodes: [
            { id: "entry", kind: "entry", label: "Entry" },
            { id: nodeId, kind: "statement", label },
            { id: "exit", kind: "exit", label: "Exit" },
          ],
        },
      ],
    },
    diagnostics: [],
    file,
    procedure: {
      id: procedureId,
      kind: "Function",
      label: "run",
      name: "run",
    },
    procedureId,
    procedures: [
      {
        id: procedureId,
        kind: "Function",
        label: "run",
        name: "run",
      },
    ],
    revision,
    source: `export function run() { ${label} }`,
  };
};

const revisionSummary = (revision: string): RevisionSummary => ({
  analyzedAt: startedAt,
  diagnosticCount: 0,
  file,
  procedureId,
  revision,
  runnable: true,
});

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

class ExecutionFixture {
  readonly controller: LiveWorkspaceController;
  readonly currentRevision: string;
  readonly revisions: readonly string[];
  readonly startedScopes: RevisionKey[] = [];
  private readonly listeners = new Set<(update: ExecutionUpdate) => void>();
  private active: ActiveExecution | undefined;
  private displayNumber = 0;

  constructor(revisions: readonly string[], currentRevision: string) {
    this.currentRevision = currentRevision;
    this.revisions = revisions;
    const ports: LiveWorkspacePorts = {
      analysis: {
        analyse: () => Promise.resolve(analysisFor(this.currentRevision)),
        listFiles: () => Promise.resolve([file]),
        listRevisions: () =>
          Promise.resolve(this.revisions.map(revisionSummary)),
        load: (scope) => Promise.resolve(analysisFor(scope.revision)),
      },
      execution: {
        cancel: (executionId) => {
          const { active } = this;
          if (active === undefined || active.executionId !== executionId) {
            return Promise.resolve();
          }
          this.active = undefined;
          this.publish({
            ...active,
            currentNodeId: null,
            error: "Execution cancelled.",
            status: "Cancelled",
          });
          return Promise.resolve();
        },
        list: () =>
          Promise.resolve(this.active === undefined ? [] : [this.active]),
        start: (scope) => {
          this.startedScopes.push(scope);
          this.displayNumber += 1;
          const active: ActiveExecution = {
            currentNodeId: null,
            displayNumber: this.displayNumber,
            executionId: `execution-${this.displayNumber}`,
            scope,
            startedAt,
            status: "Running",
          };
          this.active = active;
          this.publish(active);
          this.publish({
            ...active,
            currentNodeId: `node-${scope.revision}`,
            status: "Running",
          });
          return Promise.resolve(active.executionId);
        },
      },
      localExecutionUpdates: {
        subscribe: (listener) => {
          this.listeners.add(listener);
          return () => this.listeners.delete(listener);
        },
      },
      projectId: "project-1",
    };
    this.controller = new LiveWorkspaceController(ports);
  }

  async open(): Promise<void> {
    this.controller.start();
    await settle();
  }

  async selectRevision(revision: string): Promise<void> {
    this.controller.selectRevision({ file, procedureId, revision });
    await settle();
  }

  async run(): Promise<void> {
    this.controller.runProcedure();
    await settle();
  }

  private publish(update: ExecutionUpdate): void {
    for (const listener of this.listeners) {
      listener(update);
    }
  }
}

let fixture: ExecutionFixture | undefined;

const replaceFixture = async (
  revisions: readonly string[],
  currentRevision: string
): Promise<ExecutionFixture> => {
  fixture?.controller.dispose();
  fixture = new ExecutionFixture(revisions, currentRevision);
  await fixture.open();
  return fixture;
};

afterAll(() => {
  fixture?.controller.dispose();
  fixture = undefined;
});

describeFeature(feature, ({ Scenario }) => {
  Scenario(
    "Run the selected revision while a newer revision exists",
    ({ Given, When, Then, And }) => {
      Given(
        '{string} has Analysis revisions {string} and {string}',
        async (_context, selectedFile, olderRevision, newerRevision) => {
          expect(selectedFile).toBe(file);
          await replaceFixture([newerRevision, olderRevision], newerRevision);
        }
      );

      And(
        'Analysis revision {string} is selected while {string} is current',
        async (_context, selectedRevision, currentRevision) => {
          expect(fixture?.currentRevision).toBe(currentRevision);
          await fixture?.selectRevision(selectedRevision);
        }
      );

      When("I run the selected Procedure", async () => {
        await fixture?.run();
      });

      Then(
        'the active Execution uses Analysis revision {string}',
        (_context, revision) => {
          expect(fixture?.startedScopes.at(-1)?.revision).toBe(revision);
          expect(fixture?.controller.queries.getActiveExecutions()).toContainEqual(
            expect.objectContaining({ scope: expect.objectContaining({ revision }) })
          );
        }
      );

      And("its progress is shown on the selected Control-flow graph", () => {
        const active = fixture?.controller.queries.getActiveExecutions()[0];
        const graph =
          active === undefined
            ? undefined
            : fixture?.controller.queries.getAnalysis(active.scope)?.cfg
                ?.procedures?.[0];
        expect(
          graph?.nodes.some((node) => node.id === active?.currentNodeId)
        ).toBe(true);
      });
    }
  );

  Scenario(
    "Cancel a running Execution",
    ({ Given, When, Then, And }) => {
      Given(
        'an active Execution is running Analysis revision {string}',
        async (_context, revision) => {
          await replaceFixture([revision], revision);
          await fixture?.run();
          expect(fixture?.controller.queries.getActiveExecutions()).toHaveLength(1);
        }
      );

      When("I confirm cancellation of that Execution", async () => {
        const executionId = fixture?.controller.queries.getActiveExecutions()[0]
          ?.executionId;
        if (executionId === undefined) {
          throw new Error("The fixture did not start an Execution.");
        }
        fixture?.controller.armCancel(executionId);
        fixture?.controller.confirmCancel(executionId);
        await settle();
      });

      Then("the Execution is shown as cancelled in execution history", () => {
        expect(fixture?.controller.getState().completedExecutions).toContainEqual(
          expect.objectContaining({ status: "cancelled" })
        );
      });

      And("the Execution is no longer active", () => {
        expect(fixture?.controller.queries.getActiveExecutions()).toEqual([]);
      });
    }
  );
});
