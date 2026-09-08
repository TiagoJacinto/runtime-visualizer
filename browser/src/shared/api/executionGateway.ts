import {
  ActiveExecutionSchema,
  ExecuteProcedureResponseSchema,
  type ActiveExecution,
  type RevisionKey,
} from "@runtime-visualizer/contracts";

export type ExecutionRequest = RevisionKey;

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

export class ExecutionGateway {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async start(input: ExecutionRequest, signal?: AbortSignal): Promise<string> {
    const response = await this.fetcher("/api/execute", {
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
  }

  async list(signal?: AbortSignal): Promise<readonly ActiveExecution[]> {
    const response = await this.fetcher("/api/execute", { signal });
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
  }

  async cancel(executionId: string, signal?: AbortSignal): Promise<void> {
    const response = await this.fetcher(
      `/api/execute/${encodeURIComponent(executionId)}`,
      { method: "DELETE", signal },
    );
    if (!response.ok)
      throw new ExecutionGatewayError(
        await errorMessage(response),
        response.status,
      );
  }
}

export type ExecutionGatewayPort = Pick<
  ExecutionGateway,
  "start" | "list" | "cancel"
>;
