import {
  ActiveExecutionSchema,
  ExecuteProcedureResponseSchema,
} from "@runtime-visualizer/contracts";
import type {
  ActiveExecution,
  RevisionKey,
} from "@runtime-visualizer/contracts";
import { z } from "zod";

import { ExecutionGatewayError } from "./execution-gateway-error";

export type ExecutionRequest = RevisionKey;
const errorResponseSchema = z.object({ error: z.string() });
const errorMessage = async (response: Response): Promise<string> => {
  try {
    const value = errorResponseSchema.safeParse(await response.json());
    if (value.success) {
      return value.data.error;
    }
  } catch {
    // Use the status fallback below when the response is not JSON.
  }
  return `Execution request failed (${response.status})`;
};
export class ExecutionGateway {
  private readonly fetcher: typeof fetch;

  constructor(fetcher: typeof fetch = fetch) {
    this.fetcher = fetcher.bind(globalThis);
  }
  async start(input: ExecutionRequest, signal?: AbortSignal): Promise<string> {
    const response = await this.fetcher("/api/execute", {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal,
    });
    if (!response.ok) {
      throw new ExecutionGatewayError(
        await errorMessage(response),
        response.status
      );
    }
    return ExecuteProcedureResponseSchema.parse(await response.json())
      .executionId;
  }
  async list(signal?: AbortSignal): Promise<readonly ActiveExecution[]> {
    const response = await this.fetcher("/api/execute", { signal });
    if (!response.ok) {
      throw new ExecutionGatewayError(
        await errorMessage(response),
        response.status
      );
    }
    const value = z
      .object({ executions: z.array(ActiveExecutionSchema) })
      .parse(await response.json());
    return value.executions;
  }
  async cancel(executionId: string, signal?: AbortSignal): Promise<void> {
    const response = await this.fetcher(
      `/api/execute/${encodeURIComponent(executionId)}`,
      { method: "DELETE", signal }
    );
    if (!response.ok) {
      throw new ExecutionGatewayError(
        await errorMessage(response),
        response.status
      );
    }
  }
}
export type ExecutionGatewayPort = Pick<
  ExecutionGateway,
  "start" | "list" | "cancel"
>;
