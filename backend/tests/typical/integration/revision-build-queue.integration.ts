import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { InMemoryRevisionHistory } from "../../../src/modules/analysis/infra/inMemoryRevisionHistory.ts";
import { buildAffectedRevisions } from "../../../src/modules/analysis/useCases/buildRevisionHistory/buildAffectedRevisions.ts";
import { RevisionBuildQueue } from "../../../src/modules/analysis/useCases/buildRevisionHistory/createRevisionBuildQueue.ts";
import type { AnalysisSnapshot } from "../../../src/modules/analysis/revisionHistory.ts";
import type {
  RevisionBuilderWorkerClient,
  RevisionDependencyInput,
} from "../../../src/modules/analysis/infra/revisionBuilderWorkerClient.ts";

const procedure = {
  id: "top-level",
  kind: "TopLevel" as const,
  name: null,
  label: "top",
};
const snapshot = (file: string, revision: string): AnalysisSnapshot => ({
  file,
  procedure,
  revision,
  source: "export const value = 1;",
  files: { [file]: "export const value = 1;" },
  procedures: [procedure],
  cfg: null,
  diagnostics: [],
  analyzedAt: new Date().toISOString(),
});

class FakeWorker implements RevisionBuilderWorkerClient {
  readonly calls: string[] = [];
  failures = 0;
  async resolveAffectedFiles(
    input: RevisionDependencyInput,
  ): Promise<readonly string[]> {
    return Object.keys(input.files);
  }

  async build(input: { file: string }): Promise<AnalysisSnapshot> {
    this.calls.push(input.file);
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("temporary worker failure");
    }
    return snapshot(input.file, `revision-${this.calls.length}`);
  }
}

describe("revision build queue", () => {
  let folder: string | undefined;
  let queue: RevisionBuildQueue | undefined;
  afterEach(async () => {
    queue?.close();
    if (folder) await rm(folder, { recursive: true, force: true });
  });

  it("rebuilds every Procedure whose dependency changed and publishes only persisted revisions", async () => {
    folder = await mkdtemp(path.join(os.tmpdir(), "revision-build-"));
    await writeFile(
      path.join(folder, "dependency.ts"),
      "export const value = 1;\n",
    );
    await writeFile(
      path.join(folder, "main.ts"),
      'import { value } from "./dependency";\nfunction prepare() { return value; }\n',
    );
    const history = new InMemoryRevisionHistory();
    const ready: string[] = [];
    const result = await buildAffectedRevisions(
      folder,
      ["dependency.ts"],
      history,
      async ({ file, procedure }) => snapshot(file, procedure.id),
      (item) => ready.push(item.procedure.id),
    );
    expect(result.affectedFiles).toEqual(["dependency.ts", "main.ts"]);
    expect(result.snapshots).toHaveLength(3);
    expect(result.snapshots.map((item) => item.file)).toEqual([
      "dependency.ts",
      "main.ts",
      "main.ts",
    ]);
    expect(ready).toHaveLength(3);
  });

  it("prioritizes interactive work, coalesces change paths, and retries infrastructure failures", async () => {
    folder = await mkdtemp(path.join(os.tmpdir(), "revision-queue-"));
    await writeFile(path.join(folder, "main.ts"), "export const value = 1;\n");
    const worker = new FakeWorker();
    worker.failures = 2;
    const failures: Error[] = [];
    queue = new RevisionBuildQueue(folder, new InMemoryRevisionHistory(), {
      workerClient: worker,
      retryDelaysMs: [0, 0],
      onFailure: (_paths, error) => failures.push(error),
    });
    const interactive = queue.analyze(["main.ts"]);
    const result = await interactive;
    expect(result).toHaveLength(1);
    expect(worker.calls).toEqual(["main.ts", "main.ts", "main.ts"]);
    expect(failures).toEqual([]);

    const failedPaths: string[][] = [];
    const permanentlyFailing: RevisionBuilderWorkerClient = {
      resolveAffectedFiles: async ({ files }) => Object.keys(files),
      build: async () => {
        throw new Error("permanent worker failure");
      },
    };
    queue.close();
    queue = new RevisionBuildQueue(folder, new InMemoryRevisionHistory(), {
      workerClient: permanentlyFailing,
      retryDelaysMs: [0, 0],
      onFailure: (paths) => failedPaths.push([...paths]),
    });
    await expect(queue.analyze(["main.ts"])).rejects.toThrow(
      "permanent worker failure",
    );
    expect(failedPaths).toEqual([["main.ts"]]);

    const calls: string[][] = [];
    const recordingWorker: RevisionBuilderWorkerClient = {
      resolveAffectedFiles: async ({ files }) => Object.keys(files),
      build: async (input) => {
        calls.push(Object.keys(input.files));
        return snapshot(input.file, `r-${calls.length}`);
      },
    };
    queue.close();
    queue = new RevisionBuildQueue(folder, new InMemoryRevisionHistory(), {
      workerClient: recordingWorker,
      debounceMs: 5,
      retryDelaysMs: [0],
    });
    queue.enqueueAffected(["main.ts"], "change");
    queue.enqueueAffected(["main.ts"], "change");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(calls).toHaveLength(1);
  });
});
