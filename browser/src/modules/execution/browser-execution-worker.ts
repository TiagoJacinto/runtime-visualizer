/* oxlint-disable require-post-message-target-origin */
import type {
  ExecutionWorkerLike,
  ExecutionWorkerReply,
  ExecutionWorkerRequest,
  ExecutionWorkerResult,
} from "./index.ts";

const EXECUTION_TIMEOUT_MS = 30_000;

export interface ExecutionWorkerOptions {
  readonly createWorker?: () => ExecutionWorkerLike;
  readonly timeoutMs?: number;
  readonly onNode: (nodeId: string) => void;
  readonly signal: AbortSignal;
}

const browserWorker = (): ExecutionWorkerLike => {
  const worker = new Worker(new URL("execution.worker.ts", import.meta.url), {
    type: "module",
  });
  return {
    onError: (listener) => {
      const onError = (event: ErrorEvent): void =>
        listener(event.message || "Execution worker failed.");
      const onMessageError = (): void =>
        listener("Execution worker returned an invalid message.");
      worker.addEventListener("error", onError);
      worker.addEventListener("messageerror", onMessageError);
      return () => {
        worker.removeEventListener("error", onError);
        worker.removeEventListener("messageerror", onMessageError);
      };
    },
    onMessage: (listener) => {
      const onMessage = (event: MessageEvent<ExecutionWorkerReply>): void =>
        listener(event.data);
      worker.addEventListener("message", onMessage);
      return () => worker.removeEventListener("message", onMessage);
    },
    postMessage: (request) => worker.postMessage(request),
    terminate: () => worker.terminate(),
  };
};

// SAFETY: caught worker-post errors are normalized at this message boundary.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const runInExecutionWorker = (
  request: ExecutionWorkerRequest,
  options: ExecutionWorkerOptions
): Promise<ExecutionWorkerResult> => {
  if (options.signal.aborted) {
    return Promise.resolve({
      error: "Execution cancelled.",
      status: "Cancelled",
    });
  }

  const worker = (options.createWorker ?? browserWorker)();
  let resolveResult!: (result: ExecutionWorkerResult) => void;
  // SAFETY: the worker's terminal message, timeout, and abort all settle this one run.
  // oxlint-disable-next-line promise/avoid-new
  const result = new Promise<ExecutionWorkerResult>((resolve) => {
    resolveResult = resolve;
  });
  let settled = false;
  const subscriptions: (() => void)[] = [];
  const finish = (value: ExecutionWorkerResult): void => {
    if (settled) {
      return;
    }
    settled = true;
    // SAFETY: timeout is initialized before worker events can fire.
    // oxlint-disable-next-line eslint/no-use-before-define
    clearTimeout(timeout);
    for (const unsubscribe of subscriptions) {
      unsubscribe();
    }
    worker.terminate();
    resolveResult(value);
  };
  const onAbort = (): void =>
    finish({ error: "Execution cancelled.", status: "Cancelled" });
  const timeout = setTimeout(
    () => finish({ error: "Execution timed out.", status: "Failed" }),
    options.timeoutMs ?? EXECUTION_TIMEOUT_MS
  );
  options.signal.addEventListener("abort", onAbort, { once: true });
  subscriptions.push(
    () => options.signal.removeEventListener("abort", onAbort),
    worker.onMessage((message) => {
      if (message.type === "node") {
        options.onNode(message.nodeId);
        return;
      }
      finish({ error: message.error, status: message.status });
    }),
    worker.onError((message) => finish({ error: message, status: "Failed" }))
  );

  if (options.signal.aborted) {
    onAbort();
  } else {
    try {
      worker.postMessage(request);
    } catch (error) {
      finish({ error: errorMessage(error), status: "Failed" });
    }
  }
  return result;
};
