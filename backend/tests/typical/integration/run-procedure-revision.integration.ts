import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "../../../src/shared/infra/http/app.js";

describe("backend-owned execution revisions", () => {
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let folder: string | undefined;

	afterEach(async () => {
		await app?.close();
		if (folder !== undefined)
			await fs.rm(folder, { recursive: true, force: true });
		app = undefined;
		folder = undefined;
	});

	it("rejects an unavailable execution revision", async () => {
		folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
		await fs.writeFile(path.join(folder, "main.ts"), "function prepare() {}\n");
		app = await createApp({ filesFolder: folder });

		const response = await app.inject({
			method: "POST",
			url: "/api/execute",
			payload: {
				file: "main.ts",
				name: "prepare",
				revision: "R1",
			},
		});

		// result verification
		expect(response.statusCode).toBe(409);
		expect(response.json()).toEqual({ error: "Revision unavailable" });
	});

	it("executes a stored revision after its backing file is deleted", async () => {
		folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
		const file = path.join(folder, "main.ts");
		await fs.writeFile(file, "function prepare() { return 1; }\n");
		app = await createApp({ filesFolder: folder });
		const cfgResponse = await app.inject({
			method: "GET",
			url: "/api/cfg?file=main.ts&name=prepare",
		});
		const revision = (cfgResponse.json() as { revision: string }).revision;
		await fs.rm(file);

		const response = await app.inject({
			method: "POST",
			url: "/api/execute",
			payload: { file: "main.ts", name: "prepare", revision },
		});

		// result verification
		expect(response.statusCode).toBe(200);
		expect(response.body).toContain('"status":"Succeeded"');
	});

	it("runs during a queued update against the displayed revision", async () => {
		folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
		await fs.writeFile(
			path.join(folder, "main.ts"),
			"function prepare() { return 1; }\n",
		);
		app = await createApp({ filesFolder: folder });
		const sourceResponse = await app.inject({
			method: "GET",
			url: "/api/source?file=main.ts",
		});
		const revision = (sourceResponse.json() as { revision: string }).revision;
		const cfgResponse = await app.inject({
			method: "GET",
			url: "/api/cfg?file=main.ts&name=prepare",
		});
		expect(cfgResponse.statusCode).toBe(200);
		await fs.writeFile(
			path.join(folder, "main.ts"),
			'function prepare() { throw new Error("new revision"); }\n',
		);

		const response = await app.inject({
			method: "POST",
			url: "/api/execute",
			payload: { file: "main.ts", name: "prepare", revision },
		});
		const events = response.body
			.trim()
			.split("\n")
			.map(
				(line: string) =>
					JSON.parse(line) as { event: string; data?: { status?: string } },
			);

		// result verification
		expect(response.statusCode).toBe(200);
		expect(events.at(-1)).toEqual({
			event: "result",
			data: { status: "Succeeded" },
		});
	});

	it("starts concurrent executions from one displayed revision", async () => {
		folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
		await fs.writeFile(
			path.join(folder, "main.ts"),
			"function prepare() { return 1; }\n",
		);
		app = await createApp({ filesFolder: folder });
		const runningApp = app;
		const sourceResponse = await runningApp.inject({
			method: "GET",
			url: "/api/source?file=main.ts",
		});
		const revision = (sourceResponse.json() as { revision: string }).revision;
		const cfgResponse = await runningApp.inject({
			method: "GET",
			url: "/api/cfg?file=main.ts&name=prepare",
		});
		expect(cfgResponse.statusCode).toBe(200);

		const responses = await Promise.all(
			["run-1", "run-2"].map(() =>
				runningApp.inject({
					method: "POST",
					url: "/api/execute",
					payload: { file: "main.ts", name: "prepare", revision },
				}),
			),
		);
		const streams = responses.map((response) =>
			response.body
				.trim()
				.split("\n")
				.map((line: string) => JSON.parse(line) as { event: string }),
		);

		// result verification
		expect(responses.every((response) => response.statusCode === 200)).toBe(
			true,
		);
		expect(streams).toHaveLength(2);
		expect(
			streams.every((stream) =>
				stream.some((event: { event: string }) => event.event === "node"),
			),
		).toBe(true);
		expect(streams.every((stream) => stream.at(-1)?.event === "result")).toBe(
			true,
		);
	});
});
