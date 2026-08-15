import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "../../../src/shared/infra/http/app.js";

describe("execution incoming adapter", () => {
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let folder: string | undefined;

	afterEach(async () => {
		await app?.close();
		if (folder !== undefined)
			await fs.rm(folder, { recursive: true, force: true });
		app = undefined;
		folder = undefined;
	});

	it("returns X-Execution-Id header with a valid execution", async () => {
		folder = await fs.mkdtemp(
			path.join(os.tmpdir(), "runtime-visualizer-"),
		);
		await fs.writeFile(
			path.join(folder, "main.ts"),
			"function prepare() { return 1; }\n",
		);
		app = await createApp({ filesFolder: folder });

		const cfgResponse = await app.inject({
			method: "GET",
			url: "/api/cfg?file=main.ts&name=prepare",
		});
		const revision = (cfgResponse.json() as { revision: string }).revision;

		const response = await app.inject({
			method: "POST",
			url: "/api/execute",
			payload: { file: "main.ts", name: "prepare", revision },
		});

		expect(response.statusCode).toBe(200);
		const executionId = response.headers["x-execution-id"];
		expect(typeof executionId).toBe("string");
		expect((executionId as string).length).toBeGreaterThan(0);
	});

	it("returns ordered NDJSON events with a node record and terminal result", async () => {
		folder = await fs.mkdtemp(
			path.join(os.tmpdir(), "runtime-visualizer-"),
		);
		await fs.writeFile(
			path.join(folder, "main.ts"),
			"function greet() { return 42; }\n",
		);
		app = await createApp({ filesFolder: folder });

		const cfgResponse = await app.inject({
			method: "GET",
			url: "/api/cfg?file=main.ts&name=greet",
		});
		const revision = (cfgResponse.json() as { revision: string }).revision;

		const response = await app.inject({
			method: "POST",
			url: "/api/execute",
			payload: { file: "main.ts", name: "greet", revision },
		});

		expect(response.statusCode).toBe(200);
		const lines = response.body
			.trim()
			.split("\n")
			.map((line: string) => JSON.parse(line) as { event: string; data?: Record<string, unknown> });

		expect(lines.length).toBeGreaterThanOrEqual(2);
		const nodeEvents = lines.filter((e) => e.event === "node");
		const resultEvents = lines.filter((e) => e.event === "result");
		expect(nodeEvents.length).toBeGreaterThanOrEqual(1);
		expect(resultEvents).toHaveLength(1);
		expect(resultEvents[0]?.data?.status).toBe("Succeeded");
	});

	it("returns a unique X-Execution-Id for each concurrent execution", async () => {
		folder = await fs.mkdtemp(
			path.join(os.tmpdir(), "runtime-visualizer-"),
		);
		await fs.writeFile(
			path.join(folder, "main.ts"),
			"function compute() { return 1; }\n",
		);
		app = await createApp({ filesFolder: folder });

		const cfgResponse = await app.inject({
			method: "GET",
			url: "/api/cfg?file=main.ts&name=compute",
		});
		const revision = (cfgResponse.json() as { revision: string }).revision;

		const responses = await Promise.all(
			Array.from({ length: 3 }, () =>
				app!.inject({
					method: "POST",
					url: "/api/execute",
					payload: { file: "main.ts", name: "compute", revision },
				}),
			),
		);

		const ids = responses.map((r) =>
			r.headers["x-execution-id"] as string,
		);
		expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(
			true,
		);
		expect(new Set(ids).size).toBe(3);
	});

	it("returns 409 when revision is unavailable", async () => {
		folder = await fs.mkdtemp(
			path.join(os.tmpdir(), "runtime-visualizer-"),
		);
		await fs.writeFile(
			path.join(folder, "main.ts"),
			"function run() { return 1; }\n",
		);
		app = await createApp({ filesFolder: folder });

		const response = await app.inject({
			method: "POST",
			url: "/api/execute",
			payload: { file: "main.ts", name: "run", revision: "nonexistent" },
		});

		expect(response.statusCode).toBe(409);
		expect(response.json()).toEqual({ error: "Revision unavailable" });
	});

	it("returns 422 for a pre-stream diagnostic error with inline source", async () => {
		folder = await fs.mkdtemp(
			path.join(os.tmpdir(), "runtime-visualizer-"),
		);
		await fs.writeFile(
			path.join(folder, "main.ts"),
			"function run() { return 1; }\n",
		);
		app = await createApp({ filesFolder: folder });

		const response = await app.inject({
			method: "POST",
			url: "/api/execute",
			payload: {
				source: "function broken() { invalid }",
				filePath: "broken.ts",
			},
		});

		expect(response.statusCode).toBe(422);
		const body = response.json() as {
			ok: boolean;
			diagnostics: unknown[];
		};
		expect(body.ok).toBe(false);
		expect(Array.isArray(body.diagnostics)).toBe(true);
	});
});
