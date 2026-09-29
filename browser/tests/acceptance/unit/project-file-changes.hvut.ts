import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import type {
  AnalysisResponse,
  RevisionSummary,
} from "../../../src/modules/analysis/index.ts";
import type { LiveWorkspaceUpdate } from "../../../src/pages/liveWorkspace/useCases/live-workspace.types.ts";
import { afterAll, expect, vi } from "vitest";

import type { AnalysisSnapshot } from "../../../src/modules/analysis/index.ts";
import { LiveWorkspaceController } from "../../../src/pages/liveWorkspace/useCases/live-workspace.controller.ts";
import type {
  LiveWorkspacePorts,
  LocalWorkspaceChange,
} from "../../../src/pages/liveWorkspace/useCases/live-workspace.ports.ts";
import { projectLiveWorkspaceView } from "../../../src/pages/liveWorkspace/useCases/live-workspace.query.ts";
import type { SourceMap } from "../../../src/modules/project-files/index.ts";

const featurePath = new URL(
  "../../../../features/refresh-project-analysis.feature",
  import.meta.url
).pathname;
const feature = await loadFeature(
  featurePath.startsWith("/@fs/") ? featurePath.slice(4) : featurePath
);

type TestAnalysis = AnalysisResponse & Pick<AnalysisSnapshot, "files">;

const makeAnalysis = (
  file: string,
  revision: string,
  source: string,
  files: SourceMap
): TestAnalysis => ({
  cfg: null,
  diagnostics: [],
  file,
  files,
  procedure: {
    id: "top-level",
    kind: "TopLevel",
    label: `Top level (${file})`,
    name: null,
  },
  procedureId: "top-level",
  procedures: [
    {
      id: "top-level",
      kind: "TopLevel",
      label: `Top level (${file})`,
      name: null,
    },
  ],
  revision,
  source,
});

interface LocalChangesSpy {
  readonly initialized: Promise<void>;
  push: (event: LiveWorkspaceUpdate) => void;
  watch: (signal: AbortSignal) => AsyncGenerator<LocalWorkspaceChange>;
}

const createLocalChangesSpy = (): LocalChangesSpy => {
  const pending: LocalWorkspaceChange[] = [];
  const waiters: ((result: IteratorResult<LocalWorkspaceChange>) => void)[] = [];
  let finishInitialization: (() => void) | undefined;
  // SAFETY: setup waits until the watcher has finished its initial bootstrap.
  // oxlint-disable-next-line promise/avoid-new
  const initialized = new Promise<void>((resolve) => {
    finishInitialization = resolve;
  });
  const push = (event: LiveWorkspaceUpdate): void => {
    const change: LocalWorkspaceChange = { event, kind: "event" };
    const waiter = waiters.shift();
    if (waiter === undefined) {
      pending.push(change);
    } else {
      waiter({ done: false, value: change });
    }
  };
  const watchChanges = async function* watchChanges(
    signal: AbortSignal
  ): AsyncGenerator<LocalWorkspaceChange> {
    yield { kind: "ready" };
    finishInitialization?.();
    while (!signal.aborted) {
      const next = pending.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      // SAFETY: the iterator waits for one event or its abort signal before continuing.
      // oxlint-disable eslint/no-await-in-loop promise/avoid-new
      const result = await new Promise<IteratorResult<LocalWorkspaceChange>>(
        (resolve) => {
          waiters.push(resolve);
          signal.addEventListener(
            "abort",
            () => resolve({ done: true, value: undefined }),
            { once: true }
          );
        }
      );
      // oxlint-enable eslint/no-await-in-loop promise/avoid-new
      if (result.done) {
        return;
      }
      yield result.value;
    }
  };
  return { initialized, push, watch: watchChanges };
};

class ProjectFixture {
  controller: LiveWorkspaceController | undefined;
  readonly sources = new Map<string, string>();
  private localChanges = createLocalChangesSpy();
  private revisionsByFile = new Map<string, RevisionSummary[]>();
  private analysesByKey = new Map<string, TestAnalysis>();
  private currentRevisionByFile = new Map<string, string>();
  private revisionSequence = 0;

  async setupProject(project: SourceMap): Promise<void> {
    this.sources.clear();
    for (const [file, source] of Object.entries(project)) {
      this.sources.set(file, source);
    }
    this.revisionsByFile = new Map();
    this.analysesByKey = new Map();
    this.currentRevisionByFile = new Map();
    this.revisionSequence = 0;
    this.localChanges = createLocalChangesSpy();
    const changes = this.localChanges;
    for (const file of this.sources.keys()) {
      this.saveRevision(file, "revision-1");
    }
    const ports: LiveWorkspacePorts = {
      analysis: {
        analyse: (file) => {
          const revision = this.currentRevisionByFile.get(file);
          const snapshot =
            revision === undefined
              ? undefined
              : this.analysesByKey.get(ProjectFixture.revisionKey(file, revision));
          return snapshot === undefined
            ? Promise.reject(new Error(`No analysis for ${file}`))
            : Promise.resolve(snapshot);
        },
        listFiles: () => Promise.resolve([...this.sources.keys()].toSorted()),
        listRevisions: ({ file }) =>
          Promise.resolve(this.revisionsByFile.get(file) ?? []),
        load: (key) => {
          const snapshot = this.analysesByKey.get(
            ProjectFixture.revisionKey(key.file, key.revision)
          );
          return snapshot === undefined
            ? Promise.reject(new Error(`No analysis for ${key.file}`))
            : Promise.resolve(snapshot);
        },
      },
      execution: {
        cancel: () => Promise.resolve(),
        list: () => Promise.resolve([]),
        start: () => Promise.resolve("execution-1"),
      },
      localChanges: { watch: (signal) => changes.watch(signal) },
    };
    this.controller = new LiveWorkspaceController(ports);
    this.controller.start();
    await changes.initialized;
    await vi.waitFor(() =>
      expect(this.controller?.getState().selection.status).toBe("selected")
    );
  }

  async selectFile(file: string): Promise<void> {
    this.controller?.selectFile(file);
    await vi.waitFor(() =>
      expect(this.controller?.getState().selection).toMatchObject({
        scope: { file },
        status: "selected",
      })
    );
  }

  async addSource(file: string, source: string): Promise<void> {
    this.sources.set(file, source);
    this.saveRevision(file, "revision-1");
    this.localChanges.push({
      change: { change: "added", file, type: "file-changed" },
      type: "source-change",
    });
    await vi.waitFor(() =>
      expect(this.controller?.queries.getFiles()).toContain(file)
    );
  }

  async changeSource(
    file: string,
    source: string,
    dependentFile = file
  ): Promise<void> {
    this.sources.set(file, source);
    const summary = this.saveRevision(dependentFile, "revision-2");
    this.localChanges.push({
      change: {
        change: "modified",
        file,
        revision: "revision-2",
        type: "file-changed",
      },
      type: "source-change",
    });
    if (dependentFile !== file) {
      this.localChanges.push({ revision: summary, type: "revision-ready" });
    }
    await vi.waitFor(async () => {
      const history = await this.controller?.queries.fetchRevisions({
        file: dependentFile,
        procedureId: "top-level",
      });
      expect(history?.[0]?.revision).toBe("revision-2");
    });
  }

  async deleteSource(file: string): Promise<void> {
    this.sources.delete(file);
    this.localChanges.push({
      change: { change: "deleted", file, type: "file-changed" },
      type: "source-change",
    });
    const [nextFile] = [...this.sources.keys()].toSorted();
    await vi.waitFor(() => {
      expect(this.controller?.queries.getFiles()).not.toContain(file);
      if (nextFile === undefined) {
        expect(this.controller?.getState().selection).toEqual({
          status: "unselected",
        });
      } else {
        expect(this.controller?.getState().selection).toMatchObject({
          scope: { file: nextFile },
          status: "selected",
        });
      }
    });
  }

  saveRevision(file: string, revision: string): RevisionSummary {
    const source = this.sources.get(file);
    if (source === undefined) {
      throw new Error(`No source available for ${file}`);
    }
    const summary: RevisionSummary = {
      analyzedAt: new Date(Date.now() + this.revisionSequence).toISOString(),
      diagnosticCount: 0,
      file,
      procedureId: "top-level",
      revision,
      runnable: false,
    };
    this.revisionSequence += 1;
    this.analysesByKey.set(
      ProjectFixture.revisionKey(file, revision),
      makeAnalysis(file, revision, source, Object.fromEntries(this.sources))
    );
    this.revisionsByFile.set(file, [
      summary,
      ...(this.revisionsByFile.get(file) ?? []).filter(
        (existing) => existing.revision !== revision
      ),
    ]);
    this.currentRevisionByFile.set(file, revision);
    return summary;
  }

  getRevisions(file: string): Promise<readonly RevisionSummary[]> {
    return this.controller?.queries.fetchRevisions({
      file,
      procedureId: "top-level",
    }) ?? Promise.resolve([]);
  }

  getCurrentAnalysis(file: string): Promise<AnalysisResponse> {
    const current = this.controller;
    return current === undefined
      ? Promise.reject(new Error("Workspace controller has not been set up"))
      : current.queries.fetchCurrentAnalysis(file);
  }

  async getRevisionAnalysis(
    file: string,
    revision: string
  ): Promise<TestAnalysis | undefined> {
    const analysis = await this.controller?.queries.fetchAnalysis({
      file,
      procedureId: "top-level",
      revision,
    });
    // SAFETY: the fixture Analysis object always carries its input source map.
    return analysis as TestAnalysis | undefined;
  }

  dispose(): void {
    this.controller?.dispose();
  }

  private static revisionKey(file: string, revision: string): string {
    return `${file}\u0000top-level\u0000${revision}`;
  }
}

describeFeature(feature, ({ Scenario }) => {
  Scenario("Include a newly added source file", ({ Given, When, Then, And }) => {
    const fixture = new ProjectFixture();
    afterAll(() => fixture.dispose());

    Given('I have opened a project containing {string}', async (_context, file) => {
      await fixture.setupProject({ [file]: "export const main = true;" });
    });

    When('{string} is added to the project', async (_context, file) => {
      await fixture.addSource(file, "export const helper = true;");
    });

    Then('{string} appears in the project file tree', (_context, file) => {
      expect(fixture.controller?.queries.getFiles()).toContain(file);
    });

    And("its source is available for analysis", async () => {
      const file = [...fixture.sources.keys()].find((path) =>
        path.endsWith("helper.ts")
      );
      expect(file).toBeDefined();
      if (file === undefined) {
        return;
      }
      const analysis = await fixture.getCurrentAnalysis(file);
      expect(analysis?.source).toBe(fixture.sources.get(file));
    });
  });

  Scenario(
    "Refresh the selected analysis when its source changes",
    ({ Given, When, Then, And }) => {
      const fixture = new ProjectFixture();
      afterAll(() => fixture.dispose());

      Given(
        'I have opened a project with {string} selected at Analysis revision {string}',
        async (_context, file, revision) => {
          await fixture.setupProject({
            [file]: "export function run() { return 1; }",
          });
          await fixture.selectFile(file);
          expect(fixture.controller?.getState().selection).toMatchObject({
            scope: { file, revision },
            status: "selected",
          });
        }
      );

      When('the source of {string} changes', async (_context, file) => {
        await fixture.changeSource(
          file,
          "export function run() { return 2; }"
        );
        await vi.waitFor(() =>
          expect(fixture.controller?.getState().selection).toMatchObject({
            scope: { file, revision: "revision-2" },
            status: "selected",
          })
        );
      });

      Then("the workspace displays the updated source", () => {
        const selection = fixture.controller?.getState().selection;
        expect(selection).toMatchObject({
          scope: { file: "src/main.ts", revision: "revision-2" },
          status: "selected",
        });
        if (selection?.status === "selected") {
          expect(
            fixture.controller?.queries.getAnalysis(selection.scope)?.source
          ).toBe("export function run() { return 2; }");
        }
      });

      And("a new Analysis revision is selected", () => {
        expect(fixture.controller?.getState().selection).toMatchObject({
          scope: { revision: "revision-2" },
          status: "selected",
        });
      });

      And('Analysis revision {string} remains available', async (_context, revision) => {
        const history = await fixture.getRevisions("src/main.ts");
        expect(history.map((item) => item.revision)).toContain(revision);
      });
    }
  );

  Scenario(
    "Reanalyze a Procedure when its dependency changes",
    ({ Given, And, When, Then }) => {
      const fixture = new ProjectFixture();
      afterAll(() => fixture.dispose());

      Given(
        'I have opened a project where {string} imports {string}',
        async (_context, mainFile, helperFile) => {
          await fixture.setupProject({
            [helperFile]: "export const helper = () => 1;",
            [mainFile]:
              "import { helper } from './helper'; export function run() { return helper(); }",
          });
          await fixture.selectFile(mainFile);
        }
      );

      And('{string} has an Analysis revision based on the current helper source', (_context, file) => {
        expect(fixture.controller?.getState().selection).toMatchObject({
          scope: { file, revision: "revision-1" },
          status: "selected",
        });
      });

      When('the source of {string} changes', async (_context, file) => {
        await fixture.changeSource(
          file,
          "export const helper = () => 2;",
          "src/main.ts"
        );
      });

      Then('a new Analysis revision is available for {string}', async (_context, file) => {
        const history = await fixture.getRevisions(file);
        expect(history[0]?.revision).toBe("revision-2");
      });

      And("the new Analysis revision uses the changed helper source", async () => {
        const analysis = await fixture.getRevisionAnalysis(
          "src/main.ts",
          "revision-2"
        );
        expect(analysis?.files["src/helper.ts"]).toBe(
          "export const helper = () => 2;"
        );
      });
    }
  );

  Scenario(
    "Keep the workspace selection valid when a selected file is deleted",
    ({ Given, And, When, Then }) => {
      const fixture = new ProjectFixture();
      afterAll(() => fixture.dispose());

      Given(
        'I have opened a project containing {string} and {string}',
        async (_context, firstFile, secondFile) => {
          await fixture.setupProject({
            [firstFile]: "export const main = true;",
            [secondFile]: "export const helper = true;",
          });
        }
      );

      And('"src/main.ts" is selected', async () => {
        await fixture.selectFile("src/main.ts");
      });

      When('"src/main.ts" is deleted from the project', async () => {
        await fixture.deleteSource("src/main.ts");
      });

      Then('{string} is absent from the project file tree', (_context, file) => {
        expect(fixture.controller?.queries.getFiles()).not.toContain(file);
      });

      And('"src/helper.ts" is selected', () => {
        expect(fixture.controller?.getState().selection).toMatchObject({
          scope: { file: "src/helper.ts" },
          status: "selected",
        });
      });

      And('the Analysis revision history for {string} remains available', async (_context, file) => {
        const history = await fixture.getRevisions(file);
        expect(history.map((item) => item.revision)).toContain("revision-1");
      });
    }
  );

  Scenario(
    "Show an empty state when the last source file is deleted",
    ({ Given, And, When, Then }) => {
      const fixture = new ProjectFixture();
      afterAll(() => fixture.dispose());

      Given('I have opened a project containing only {string}', async (_context, file) => {
        await fixture.setupProject({ [file]: "export const main = true;" });
      });

      And('"src/main.ts" is selected', async () => {
        await fixture.selectFile("src/main.ts");
      });

      When('"src/main.ts" is deleted from the project', async () => {
        await fixture.deleteSource("src/main.ts");
      });

      Then("the project file tree contains no source files", () => {
        expect(fixture.controller?.queries.getFiles()).toEqual([]);
      });

      And(
        "the workspace indicates that no TypeScript or TSX source files are available",
        () => {
          const { controller } = fixture;
          if (controller === undefined) {
            throw new Error("Workspace controller has not been set up");
          }
          expect(
            projectLiveWorkspaceView(controller.getState(), {
              activeExecutions: [],
              analysis: null,
              analysisError: null,
              analysisStatus: "empty",
              files: [],
              filesError: null,
              filesLoading: false,
              revisions: [],
            }).status
          ).toBe("empty");
        }
      );

      And("no source file is selected", () => {
        expect(fixture.controller?.getState().selection).toEqual({
          status: "unselected",
        });
      });
    }
  );
});
