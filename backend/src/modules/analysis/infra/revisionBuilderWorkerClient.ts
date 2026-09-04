import { Worker } from "node:worker_threads";
import type { AnalysisSnapshot } from "../revisionHistory.ts";
import type {
  RevisionBuildInput,
  RevisionBuilderWorkerRequest,
  RevisionDependencyInput,
} from "./revisionBuilderWorker.ts";

export type {
  RevisionBuildInput,
  RevisionDependencyInput,
} from "./revisionBuilderWorker.ts";

export interface RevisionBuilderWorkerClient {
  build(input: RevisionBuildInput): Promise<AnalysisSnapshot>;
  resolveAffectedFiles(
    input: RevisionDependencyInput,
  ): Promise<readonly string[]>;
  close?(): Promise<void> | void;
}

type WorkerResponse = {
  readonly ok: boolean;
  readonly snapshot?: AnalysisSnapshot;
  readonly affectedFiles?: readonly string[];
  readonly error?: string;
};

/** One replaceable, single-flight worker. A failed worker is discarded and rebuilt on the next item. */
export class DefaultRevisionBuilderWorkerClient
  implements RevisionBuilderWorkerClient
{
  private worker: Worker | undefined;
  private closed = false;
  private inFlight: Promise<void> = Promise.resolve();

  build(input: RevisionBuildInput): Promise<AnalysisSnapshot> {
    return this.dispatch({ type: "build", input }).then((response) => {
      if (!response.ok || response.snapshot === undefined) {
        throw new Error(response.error ?? "Revision worker failed");
      }
      return response.snapshot;
    });
  }

  resolveAffectedFiles(
    input: RevisionDependencyInput,
  ): Promise<readonly string[]> {
    return this.dispatch({ type: "affected-files", input }).then((response) => {
      if (!response.ok || response.affectedFiles === undefined) {
        throw new Error(response.error ?? "Revision worker failed");
      }
      return response.affectedFiles;
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.inFlight;
    const worker = this.worker;
    this.worker = undefined;
    if (worker !== undefined) await worker.terminate();
  }

  private dispatch(
    request: RevisionBuilderWorkerRequest,
  ): Promise<WorkerResponse> {
    if (this.closed) {
      return Promise.reject(new Error("Revision worker is closed"));
    }
    const operation = this.inFlight.then(() => this.request(request));
    this.inFlight = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private request(
    request: RevisionBuilderWorkerRequest,
  ): Promise<WorkerResponse> {
    const worker = (this.worker ??= new Worker(
      new URL("./revisionBuilderWorker.ts", import.meta.url),
    ));
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        worker.off("message", onMessage);
        worker.off("error", onError);
        worker.off("exit", onExit);
      };
      const onMessage = (message: WorkerResponse) => {
        cleanup();
        resolve(message);
      };
      const onError = (error: Error) => {
        cleanup();
        this.worker = undefined;
        void worker.terminate();
        reject(error);
      };
      const onExit = (code: number) => {
        cleanup();
        if (code === 0)
          reject(new Error("Revision worker exited before responding"));
        else reject(new Error(`Revision worker exited with code ${code}`));
      };
      worker.once("message", onMessage);
      worker.once("error", onError);
      worker.once("exit", onExit);
      worker.postMessage(request);
    });
  }
}
