/* oxlint-disable avoid-new, require-post-message-target-origin */
import type { AnalysisSnapshot, AnalysisWorker } from "./index.ts";

type AnalysisInput = Parameters<AnalysisWorker["analyze"]>[0];
interface PendingRequest {
  readonly resolve: (snapshot: AnalysisSnapshot) => void;
  readonly reject: (error: Error) => void;
}
interface WorkerReply {
  readonly id: number;
  readonly snapshot?: AnalysisSnapshot;
  readonly error?: string;
}

export class BrowserAnalysisWorker implements AnalysisWorker {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 0;
  private disposed = false;

  constructor(
    createWorker: () => Worker = () =>
      new Worker(new URL("analysis.worker.ts", import.meta.url), {
        type: "module",
      })
  ) {
    this.worker = createWorker();
    this.worker.addEventListener("message", (event) => {
      // SAFETY: analysis.worker.ts is the only message sender and uses WorkerReply.
      const reply = event.data as WorkerReply;
      const request = this.pending.get(reply.id);
      if (request === undefined) {
        return;
      }
      this.pending.delete(reply.id);
      if (reply.error !== undefined) {
        request.reject(new Error(reply.error));
      } else if (reply.snapshot === undefined) {
        request.reject(new Error("Analysis worker returned an empty response."));
      } else {
        request.resolve(reply.snapshot);
      }
    });
    this.worker.addEventListener("error", (event) => {
      this.rejectPending(new Error(event.message || "Analysis worker failed."));
    });
  }

  analyze(input: AnalysisInput): Promise<AnalysisSnapshot> {
    if (this.disposed) {
      return Promise.reject(new Error("Analysis worker has been disposed."));
    }
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
      this.worker.postMessage({ id, input }, []);
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.worker.terminate();
    this.rejectPending(new Error("Analysis worker was terminated."));
  }

  private rejectPending(error: Error): void {
    for (const { reject } of this.pending.values()) {
      reject(error);
    }
    this.pending.clear();
  }
}
