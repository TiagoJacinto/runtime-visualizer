import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  ExecuteProcedureRequestSchema,
  ExecutionIdSchema,
  type ExecuteProcedureRequest,
} from "../../../../packages/contracts/src/index.ts";
import { HttpError, parseBody, parseParams } from "../../shared/index.ts";
import type {
  ExecutionManager,
  StartExecution,
} from "./useCases/executionManager.ts";

type ExecuteRoutesOptions = { readonly manager: ExecutionManager };
const executionParamsSchema = z.object({ executionId: ExecutionIdSchema });

function toStartExecution(request: ExecuteProcedureRequest): StartExecution {
  return {
    file: request.file,
    procedureId: request.procedureId,
    revision: request.revision,
  };
}

export const executeRoutes: FastifyPluginAsync<ExecuteRoutesOptions> = async (
  app,
  options,
) => {
  app.post("/", async (request, reply) => {
    const body = parseBody(ExecuteProcedureRequestSchema, request.body);
    try {
      const executionId = await options.manager.start(toStartExecution(body));
      return reply.code(202).send({ executionId });
    } catch (cause) {
      if (cause instanceof Error && cause.message === "Revision unavailable") {
        throw new HttpError(409, cause.message);
      }
      throw cause;
    }
  });
  app.get("/", async (_request, reply) =>
    reply.send({ executions: options.manager.listActive() }),
  );
  app.delete("/:executionId", async (request, reply) => {
    const { executionId } = parseParams(executionParamsSchema, request.params);
    const result = options.manager.cancel(executionId);
    if (result === "not-found") throw new HttpError(404, "Execution not found");
    return reply.code(202).send({ accepted: true });
  });
};
export default executeRoutes;
