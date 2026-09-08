import { Worker } from "node:worker_threads";

import type { AnalysisSnapshot } from "../revision-history.ts";
import type {
  RevisionBuildInput,
  RevisionBuilderWorkerClient,
  RevisionDependencyInput,
} from "../worker.ts";
import type { RevisionBuilderWorkerRequest } from "./revision-builder-worker.ts";

interface WorkerResponse {
  readonly ok: boolean;
  readonly snapshot?: AnalysisSnapshot;
  readonly affectedFiles?: readonly string[];
  readonly error?: string;
}

/** One replaceable, single-flight worker. A failed worker is discarded and rebuilt on the next item. */
export class DefaultRevisionBuilderWorkerClient implements RevisionBuilderWorkerClient {
  private worker: Worker | undefined;
  private closed = false;
  private inFlight: Promise<null> = Promise.resolve(null);

  async build(input: RevisionBuildInput): Promise<AnalysisSnapshot> {
    const response = await this.dispatch({ input, type: "build" });
    if (!response.ok || response.snapshot === undefined) {
      throw new Error(response.error ?? "Revision worker failed");
    }
    return response.snapshot;
  }

  async resolveAffectedFiles(
    input: RevisionDependencyInput
  ): Promise<readonly string[]> {
    const response = await this.dispatch({ input, type: "affected-files" });
    if (!response.ok || response.affectedFiles === undefined) {
      throw new Error(response.error ?? "Revision worker failed");
    }
    return response.affectedFiles;
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.inFlight;
    const { worker } = this;
    this.worker = undefined;
    if (worker !== undefined) {
      await worker.terminate();
    }
  }

  private async dispatch(
    request: RevisionBuilderWorkerRequest
  ): Promise<WorkerResponse> {
    if (this.closed) {
      throw new Error("Revision worker is closed");
    }
    const previous = this.inFlight;
    const gate = Promise.withResolvers<null>();
    this.inFlight = gate.promise;
    try {
      await previous;
      return await this.request(request);
    } finally {
      gate.resolve(null);
    }
  }

  private request(
    request: RevisionBuilderWorkerRequest
  ): Promise<WorkerResponse> {
    const { worker: existingWorker } = this;
    const worker =
      existingWorker ??
      new Worker(new URL("revision-builder-worker.ts", import.meta.url));
    if (existingWorker === undefined) {
      this.worker = worker;
    }
    const { promise, resolve, reject } =
      Promise.withResolvers<WorkerResponse>();
    const cleanup = () => {
      worker.removeAllListeners("message");
      worker.removeAllListeners("error");
      worker.removeAllListeners("exit");
    };
    const onMessage = (message: WorkerResponse) => {
      cleanup();
      resolve(message);
    };
    const onError = (error: Error) => {
      cleanup();
      this.worker = undefined;
      worker.terminate();
      reject(error);
    };
    const onExit = (code: number) => {
      cleanup();
      if (code === 0) {
        reject(new Error("Revision worker exited before responding"));
      } else {
        reject(new Error(`Revision worker exited with code ${code}`));
      }
    };
    worker.once("message", onMessage);
    worker.once("error", onError);
    worker.once("exit", onExit);
    // Node worker_threads uses a transfer list here, not a browser target origin.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    worker.postMessage(request);
    return promise;
  }
}
