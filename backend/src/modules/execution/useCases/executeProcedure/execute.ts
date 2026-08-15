import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { analyseProject } from "../../../cfg/index.ts";
import { HttpError } from "../../../../shared/index.ts";
import type { ProcedureCfg } from "../../../cfg/index.ts";
import { executeProcedure } from "./runner.ts";
import type { RevisionStore } from "../../infra/revision-store.ts";
import { canonicalSourceFile, readSource } from "../../../source/index.ts";

const requestSchema = z.object({
	source: z.string().max(1_000_000),
	filePath: z.string().optional(),
	functionName: z
		.string()
		.regex(
			/^[A-Za-z_$][A-Za-z0-9_$]*$/,
			"Function name must be a valid identifier.",
		)
		.optional(),
	files: z.record(z.string(), z.string()).optional(),
});

const revisionRequestSchema = z.object({
	file: z.string().min(1),
	name: z
		.string()
		.regex(
			/^[A-Za-z_$][A-Za-z0-9_$]*$/,
			"Procedure name must be a valid identifier.",
		)
		.optional(),
	revision: z.string().min(1),
});

type ExecuteRoutesOptions = {
	readonly filesFolder: string;
	readonly revisionStore: RevisionStore;
};

type StreamEvent =
	| { readonly event: "node"; readonly data: { readonly nodeId: string } }
	| {
			readonly event: "result";
			readonly data: {
				readonly status: "Succeeded" | "Failed";
				readonly error?: string;
			};
	  };

const executeRoutes: FastifyPluginAsync<ExecuteRoutesOptions> = async (
	app,
	options,
) => {
	app.post("/", async (req, reply) => {
		let source: string;
		let filePath: string;
		let functionName: string | undefined;
		let files: Record<string, string> | undefined;
		let snapshotProcedure: ProcedureCfg | undefined;
		let releaseSnapshot: (() => void) | undefined;
		const body = req.body ?? {};
		if (typeof body === "object" && body !== null && "source" in body) {
			const parsed = requestSchema.safeParse(body);
			if (!parsed.success) {
				const issue = parsed.error.issues[0];
				const status = issue?.code === "too_big" ? 413 : 400;
				return reply
					.code(status)
					.send({ error: issue?.message ?? "Invalid request body." });
			}
			({ source, filePath = "inline.ts", functionName, files } = parsed.data);
		} else {
			const parsed = revisionRequestSchema.safeParse(body);
			if (!parsed.success) {
				const issue = parsed.error.issues[0];
				return reply
					.code(400)
					.send({ error: issue?.message ?? "Invalid request body." });
			}
			const file = canonicalSourceFile(options.filesFolder, parsed.data.file);
			try {
				await readSource(options.filesFolder, file);
			} catch (error) {
				if (error instanceof HttpError && error.status === 404)
					return reply.code(409).send({ error: "Revision unavailable" });
				throw error;
			}
			const snapshot = options.revisionStore.acquire(
				file,
				parsed.data.name,
				parsed.data.revision,
			);
			if (snapshot === undefined)
				return reply.code(409).send({ error: "Revision unavailable" });
			source = snapshot.source;
			filePath = snapshot.filePath;
			functionName = snapshot.functionName;
			files = snapshot.files;
			snapshotProcedure = snapshot.procedure;
			releaseSnapshot = () =>
				options.revisionStore.release(
					file,
					parsed.data.name,
					parsed.data.revision,
				);
		}
		const analysis =
			snapshotProcedure === undefined
				? analyseProject({ source, filePath, functionName, files })
				: undefined;
		if (analysis !== undefined && analysis.diagnostics.length > 0) {
			releaseSnapshot?.();
			return reply
				.code(422)
				.send({ ok: false, diagnostics: analysis.diagnostics });
		}
		const procedure = snapshotProcedure ?? analysis?.cfg?.procedures?.[0];
		if (procedure === undefined) {
			releaseSnapshot?.();
			return reply.code(422).send({ error: "No executable Procedure found." });
		}

		const executionId = crypto.randomUUID();
		const encoder = new TextEncoder();
		let snapshotReleased = false;
		const release = (): void => {
			if (snapshotReleased) return;
			snapshotReleased = true;
			releaseSnapshot?.();
		};
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				const send = (event: StreamEvent): void => {
					if (controller.desiredSize === null) return;
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				};
				void executeProcedure(
					source,
					filePath,
					procedure,
					functionName,
					(nodeId) => {
						send({ event: "node", data: { nodeId } });
					},
				)
					.then((execution) => {
						send({
							event: "result",
							data: {
								status: execution.status,
								...(execution.error === undefined
									? {}
									: { error: execution.error }),
							},
						});
						release();
						if (controller.desiredSize !== null) controller.close();
					})
					.catch((cause: unknown) => {
						send({
							event: "result",
							data: {
								status: "Failed",
								error: cause instanceof Error ? cause.message : String(cause),
							},
						});
						release();
						if (controller.desiredSize !== null) controller.close();
					});
			},
		});
		return reply
			.header("content-type", "application/x-ndjson")
			.header("cache-control", "no-store")
			.header("X-Execution-Id", executionId)
			.send(stream);
	});
};

export default executeRoutes;
