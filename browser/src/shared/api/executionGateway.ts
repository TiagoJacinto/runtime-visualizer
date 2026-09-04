import {
  ActiveExecutionSchema,
  ExecuteProcedureResponseSchema,
  type ActiveExecution,
  type RevisionKey,
} from "@runtime-visualizer/contracts";

export type ExecutionRequest = RevisionKey;

export type ExecutionGateway = {
  start(input: ExecutionRequest, signal?: AbortSignal): Promise<string>;
  list(signal?: AbortSignal): Promise<readonly ActiveExecution[]>;
  cancel(executionId: string, signal?: AbortSignal): Promise<void>;
};

export class ExecutionGatewayError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ExecutionGatewayError";
    this.status = status;
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const value: unknown = await response.json();
    if (
      typeof value === "object" &&
      value !== null &&
      "error" in value &&
      typeof value.error === "string"
    )
      return value.error;
  } catch {
    // Use the status fallback below when the response is not JSON.
  }
  return `Execution request failed (${response.status})`;
}

export function createExecutionGateway(
  fetcher: typeof fetch = fetch,
): ExecutionGateway {
  return {
    async start(input, signal) {
      const response = await fetcher("/api/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal,
      });
      if (!response.ok)
        throw new ExecutionGatewayError(
          await errorMessage(response),
          response.status,
        );
      return ExecuteProcedureResponseSchema.parse(await response.json())
        .executionId;
    },
    async list(signal) {
      const response = await fetcher("/api/execute", { signal });
      if (!response.ok)
        throw new ExecutionGatewayError(
          await errorMessage(response),
          response.status,
        );
      const value: unknown = await response.json();
      if (
        typeof value !== "object" ||
        value === null ||
        !("executions" in value) ||
        !Array.isArray(value.executions)
      )
        throw new Error("Invalid executions response");
      return value.executions.map((execution) =>
        ActiveExecutionSchema.parse(execution),
      );
    },
    async cancel(executionId, signal) {
      const response = await fetcher(
        `/api/execute/${encodeURIComponent(executionId)}`,
        { method: "DELETE", signal },
      );
      if (!response.ok)
        throw new ExecutionGatewayError(
          await errorMessage(response),
          response.status,
        );
    },
  };
}
