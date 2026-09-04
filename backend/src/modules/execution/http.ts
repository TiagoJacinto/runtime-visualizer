import type { FastifyPluginAsync } from "fastify";
import { ExecuteProcedureRequestSchema } from "../../../../packages/contracts/src/index.ts";
import type { ExecutionManager } from "./useCases/executionManager.ts";

type ExecuteRoutesOptions = { readonly manager: ExecutionManager };

export const executeRoutes: FastifyPluginAsync<ExecuteRoutesOptions> = async (app, options) => {
  app.post("/", async (request, reply) => {
    const parsed = ExecuteProcedureRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request body." });
    try {
      const executionId = await options.manager.start(parsed.data);
      return reply.code(202).send({ executionId });
    } catch (cause) {
      if (cause instanceof Error && cause.message === "Revision unavailable") return reply.code(409).send({ error: cause.message });
      throw cause;
    }
  });
  app.get("/", async (_request, reply) => reply.send({ executions: options.manager.listActive() }));
  app.delete<{ Params: { executionId: string } }>("/:executionId", async (request, reply) => {
    const result = options.manager.cancel(request.params.executionId);
    if (result === "not-found") return reply.code(404).send({ error: "Execution not found" });
    return reply.code(202).send({ accepted: true });
  });
};
export default executeRoutes;
