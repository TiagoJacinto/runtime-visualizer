import type { RevisionKey } from "@runtime-visualizer/contracts";
import type { ExecutionGatewayPort } from "../../shared/api/execution-gateway.ts";

export const createEmptyExecutionPort = (): ExecutionGatewayPort => ({
  cancel: (_executionId: string) => Promise.resolve(),
  list: () => Promise.resolve([]),
  start: (_scope: RevisionKey) =>
    Promise.reject(new Error("Execution is not available in this phase.")),
});
