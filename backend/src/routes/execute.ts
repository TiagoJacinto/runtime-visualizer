import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { analyseProject } from "../cfg/project-analyzer.ts";
import { executeProcedure } from "../execution/runner.ts";

const requestSchema = z.object({
	source: z.string().max(1_000_000),
	filePath: z.string().optional(),
	files: z.record(z.string(), z.string()).optional(),
});

type StreamEvent =
	| { readonly event: "node"; readonly data: { readonly nodeId: string } }
	| { readonly event: "result"; readonly data: { readonly status: "Succeeded" | "Failed"; readonly error?: string } };

const executeRoutes: FastifyPluginAsync = async (app) => {
	app.post("/", async (req, reply) => {
		const parsed = requestSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			const status = issue?.code === "too_big" ? 413 : 400;
			return reply.code(status).send({ error: issue?.message ?? "Invalid request body." });
		}

		const { source, filePath = "inline.ts", files } = parsed.data;
		const analysis = analyseProject({ source, filePath, files });
		if (analysis.diagnostics.length > 0) {
			return reply.code(422).send({ ok: false, diagnostics: analysis.diagnostics });
		}
		const procedure = analysis.cfg?.procedures?.[0];
		if (procedure === undefined) return reply.code(422).send({ error: "No executable Procedure found." });

		const encoder = new TextEncoder();
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				const send = (event: StreamEvent): void => {
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				};
				void executeProcedure(source, filePath, procedure, (nodeId) => {
					send({ event: "node", data: { nodeId } });
				}).then((execution) => {
					send({
						event: "result",
						data: {
							status: execution.status,
							...(execution.error === undefined ? {} : { error: execution.error }),
						},
					});
					controller.close();
				}).catch((cause: unknown) => {
					send({
						event: "result",
						data: { status: "Failed", error: cause instanceof Error ? cause.message : String(cause) },
					});
					controller.close();
				});
			},
		});
		return reply
			.header("content-type", "application/x-ndjson")
			.header("cache-control", "no-store")
			.send(stream);
	});
};

export default executeRoutes;
