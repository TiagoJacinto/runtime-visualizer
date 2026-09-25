/* oxlint-disable require-post-message-target-origin */
import { createLocalAnalysisWorker } from "./local-analysis-worker.ts";
import type { AnalysisSnapshot, AnalysisWorker } from "./index.ts";

type AnalysisInput = Parameters<AnalysisWorker["analyze"]>[0];
interface WorkerRequest {
  readonly id: number;
  readonly input: AnalysisInput;
}
interface WorkerReply {
  readonly id: number;
  readonly snapshot?: AnalysisSnapshot;
  readonly error?: string;
}
interface AnalysisWorkerScope {
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<WorkerRequest>) => void
  ) => void;
  postMessage: (message: WorkerReply) => void;
}

// SAFETY: Vite loads this module only as a dedicated worker entry point.
const scope = globalThis as AnalysisWorkerScope;
const analyzer = createLocalAnalysisWorker();

scope.addEventListener("message", async (event) => {
  try {
    const snapshot = await analyzer.analyze(event.data.input);
    scope.postMessage({ id: event.data.id, snapshot });
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : "Analysis failed.",
      id: event.data.id,
    });
  }
});
