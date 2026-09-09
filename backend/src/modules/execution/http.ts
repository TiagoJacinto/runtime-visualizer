import type {
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { z } from "zod";

import {
  ExecuteProcedureRequestSchema,
  ExecutionIdSchema,
} from "../../../../packages/contracts/src/index.ts";
import type { ExecuteProcedureRequest } from "../../../../packages/contracts/src/index.ts";
import { HttpError, parseBody, parseParams } from "../../shared/index.ts";
import type {
  ExecutionManager,
  StartExecution,
} from "./useCases/execution-manager.ts";

interface ExecuteRoutesOptions {
  readonly manager: ExecutionManager;
}
const executionParamsSchema = z.object({ executionId: ExecutionIdSchema });
const toStartExecution = (
  request: ExecuteProcedureRequest
): StartExecution => ({
  file: request.file,
  procedureId: request.procedureId,
  revision: request.revision,
});
const handleStart = async (
  request: ExecuteProcedureRequest,
  manager: ExecutionManager
) => {
  try {
    const executionId = await manager.start(toStartExecution(request));
    return { executionId };
  } catch (error) {
    if (error instanceof Error && error.message === "Revision unavailable") {
      throw new HttpError(409, error.message);
    }
    throw error;
  }
};
const handleStartRequest = async (
  request: FastifyRequest,
  reply: FastifyReply,
  manager: ExecutionManager
) => {
  const result = await handleStart(
    parseBody(ExecuteProcedureRequestSchema, request.body),
    manager
  );
  return reply.code(202).send(result);
};
export const executeRoutes: FastifyPluginCallback<ExecuteRoutesOptions> = (
  app,
  options,
  done
) => {
  app.post("/", (request, reply) =>
    handleStartRequest(request, reply, options.manager)
  );
  app.get("/", (_request, reply) =>
    reply.send({ executions: options.manager.listActive() })
  );
  app.delete("/:executionId", (request, reply) => {
    const { executionId } = parseParams(executionParamsSchema, request.params);
    const result = options.manager.cancel(executionId);
    if (result === "not-found") {
      throw new HttpError(404, "Execution not found");
    }
    return reply.code(202).send({ accepted: true });
  });
  done();
};
export default executeRoutes;
