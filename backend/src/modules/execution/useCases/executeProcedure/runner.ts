import { Worker } from "node:worker_threads";

import type { ProcedureCfg } from "../../../cfg/index.ts";

export interface ExecutionResult {
  readonly status: "Succeeded" | "Failed" | "Cancelled";
  readonly events: readonly string[];
  readonly error?: string;
}
export type ExecutionObserver = (nodeId: string) => void;
export interface ExecutionOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}
const EXECUTION_TIMEOUT_MS = 30_000;
const NOOP_ABORT = (): void => undefined;
type WorkerMessage =
  | {
      readonly type: "node";
      readonly nodeId: string;
    }
  | {
      readonly type: "result";
      readonly status: "Succeeded" | "Failed";
      readonly error?: string;
    };
/** Execute a selected Procedure in an isolated worker. */
export const executeProcedure = (
  source: string,
  filePath: string,
  procedure: ProcedureCfg,
  functionName: string | undefined,
  onEvent?: ExecutionObserver,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> => {
  const events: string[] = [];
  const worker = new Worker(new URL("execution-worker.ts", import.meta.url), {
    resourceLimits: {
      codeRangeSizeMb: 4,
      maxOldGenerationSizeMb: 64,
      maxYoungGenerationSizeMb: 16,
      stackSizeMb: 4,
    },
    workerData: { filePath, functionName, procedure, source },
  });
  const deferred = Promise.withResolvers<ExecutionResult>();
  let settled = false;
  let abort = NOOP_ABORT;
  const finish = (result: ExecutionResult): void => {
    if (settled) {
      return;
    }
    settled = true;
    // SAFETY: timeout is initialized before any worker event can fire.
    // oxlint-disable-next-line eslint/no-use-before-define
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
    void worker.terminate();
    deferred.resolve(result);
  };
  abort = (): void =>
    finish({ error: "Execution cancelled.", events, status: "Cancelled" });
  const timeout = setTimeout(
    () => finish({ error: "Execution timed out.", events, status: "Failed" }),
    options.timeoutMs ?? EXECUTION_TIMEOUT_MS
  );
  if (options.signal?.aborted) {
    abort();
  } else {
    options.signal?.addEventListener("abort", abort, { once: true });
  }
  worker.on("message", (message: WorkerMessage) => {
    if (message.type === "node") {
      events.push(message.nodeId);
      onEvent?.(message.nodeId);
      return;
    }
    if (message.error === undefined) {
      finish({ events, status: message.status });
    } else {
      finish({ error: message.error, events, status: message.status });
    }
  });
  worker.on("error", (cause) =>
    finish({ error: cause.message, events, status: "Failed" })
  );
  worker.on("exit", (code) => {
    if (!settled) {
      finish({
        error: `Execution worker exited with code ${code} before returning a result.`,
        events,
        status: "Failed",
      });
    }
  });
  return deferred.promise;
};
