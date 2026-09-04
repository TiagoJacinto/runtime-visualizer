import { Worker } from "node:worker_threads";
import type { ProcedureCfg } from "../../../cfg/index.ts";

export type ExecutionResult = {
  readonly status: "Succeeded" | "Failed" | "Cancelled";
  readonly events: ReadonlyArray<string>;
  readonly error?: string;
};
export type ExecutionObserver = (nodeId: string) => void;
export type ExecutionOptions = { readonly timeoutMs?: number; readonly signal?: AbortSignal };
const EXECUTION_TIMEOUT_MS = 30_000;
type WorkerMessage =
  | { readonly type: "node"; readonly nodeId: string }
  | { readonly type: "result"; readonly status: "Succeeded" | "Failed"; readonly error?: string };

/** Execute a selected Procedure in an isolated worker. */
export async function executeProcedure(
  source: string, filePath: string, procedure: ProcedureCfg, functionName: string | undefined,
  onEvent?: ExecutionObserver, options: ExecutionOptions = {},
): Promise<ExecutionResult> {
  const events: string[] = [];
  const worker = new Worker(new URL("./execution-worker.ts", import.meta.url), {
    workerData: { source, filePath, procedure, functionName },
    resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, codeRangeSizeMb: 4, stackSizeMb: 4 },
  });
  return new Promise((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const abort = (): void => finish({ status: "Cancelled", events, error: "Execution cancelled." });
    const finish = (result: ExecutionResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      void worker.terminate();
      resolve(result);
    };
    timeout = setTimeout(() => finish({ status: "Failed", events, error: "Execution timed out." }), options.timeoutMs ?? EXECUTION_TIMEOUT_MS);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
    worker.on("message", (message: WorkerMessage) => {
      if (message.type === "node") { events.push(message.nodeId); onEvent?.(message.nodeId); return; }
      finish({ status: message.status, events, ...(message.error === undefined ? {} : { error: message.error }) });
    });
    worker.on("error", (cause) => finish({ status: "Failed", events, error: cause.message }));
    worker.on("exit", (code) => {
      if (!settled) finish({ status: "Failed", events, error: `Execution worker exited with code ${code} before returning a result.` });
    });
  });
}
