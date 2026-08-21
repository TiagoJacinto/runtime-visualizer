import {
  ExecutionEventSchema,
  ExecutionIdSchema,
  type ExecutionEvent,
} from "@runtime-visualizer/contracts";

export type ExecutionRequest = {
  file: string;
  name?: string;
  revision: string;
};

export type ExecutionStream = {
  executionId: string;
  events: AsyncIterable<ExecutionEvent>;
  cancel(): void;
};

export type ExecutionGateway = {
  start(input: ExecutionRequest, signal?: AbortSignal): Promise<ExecutionStream>;
};

export class ExecutionGatewayError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ExecutionGatewayError";
    this.status = status;
  }
}

async function* readEvents(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<ExecutionEvent> {
  if (response.body === null) throw new Error("Execution response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        yield ExecutionEventSchema.parse(JSON.parse(trimmed));
      }
    }
    buffer += decoder.decode();
    const trimmed = buffer.trim();
    if (trimmed.length > 0) yield ExecutionEventSchema.parse(JSON.parse(trimmed));
  } finally {
    if (signal.aborted) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function createExecutionGateway(fetcher: typeof fetch = fetch): ExecutionGateway {
  return {
    async start(input, signal) {
      const response = await fetcher("/api/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal,
      });
      if (!response.ok) {
        let message = `Execution request failed (${response.status})`;
        try {
          const body = (await response.json()) as { error?: unknown };
          if (typeof body.error === "string") message = body.error;
        } catch {
          // Keep the status message when the server does not return JSON.
        }
        throw new ExecutionGatewayError(message, response.status);
      }
      const executionId = response.headers.get("X-Execution-Id");
      if (executionId === null) throw new Error("Execution response has no X-Execution-Id header");
      ExecutionIdSchema.parse(executionId);
      const controller = new AbortController();
      const cancel = (): void => controller.abort();
      const events = readEvents(response, controller.signal);
      return { executionId, events, cancel };
    },
  };
}
