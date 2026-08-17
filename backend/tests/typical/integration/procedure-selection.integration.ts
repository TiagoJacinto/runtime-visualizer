import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/shared/infra/http/app.ts";

const source = `function main() { work(); }
work();
function work() {}`;

type GraphResponse = {
	cfg: {
		procedures: Array<{
			nodes: Array<{ label: string; location?: { start: { line: number } } }>;
		}>;
	};
};

describe("Procedure selection HTTP seam", () => {
	let app: Awaited<ReturnType<typeof createApp>> | undefined;

	afterEach(async () => {
		await app?.close();
		app = undefined;
	});

	it("analyzes and executes the file Procedure by default", async () => {
		app = await createApp({ filesFolder: "/tmp" });
		const graphResponse = await app.inject({
			method: "POST",
			url: "/api/cfg",
			payload: { source, filePath: "main.ts" },
		});
		const graph = graphResponse.json<GraphResponse>().cfg.procedures[0];
		if (graph === undefined) throw new Error("Expected a file Procedure graph");
		expect(graph.nodes.map((node) => node.label)).toEqual([
			"Entry",
			"work()",
			"Exit",
		]);
		expect(graph.nodes[1]?.location?.start.line).toBe(2);

		const executionResponse = await app.inject({
			method: "POST",
			url: "/api/execute",
			payload: { source, filePath: "main.ts" },
		});
		const events = executionResponse.body
			.trim()
			.split("\n")
			.map(
				(line) =>
					JSON.parse(line) as { event: string; data: { status?: string } },
			);
		expect(events.some((event) => event.event === "node")).toBe(true);
		expect(events.at(-1)).toEqual({
			event: "result",
			data: { status: "Succeeded" },
		});
	}, 30_000);

	it("analyzes and executes a Function only when explicitly selected", async () => {
		app = await createApp({ filesFolder: "/tmp" });
		const graphResponse = await app.inject({
			method: "POST",
			url: "/api/cfg",
			payload: { source, filePath: "main.ts", functionName: "main" },
		});
		const graph = graphResponse.json<GraphResponse>().cfg.procedures[0];
		if (graph === undefined)
			throw new Error("Expected a Function Procedure graph");
		expect(graph.nodes.map((node) => node.label)).toEqual([
			"Entry",
			"work()",
			"Exit",
		]);
		expect(graph.nodes[1]?.location?.start.line).toBe(1);

		const executionResponse = await app.inject({
			method: "POST",
			url: "/api/execute",
			payload: { source, filePath: "main.ts", functionName: "main" },
		});
		const events = executionResponse.body
			.trim()
			.split("\n")
			.map(
				(line) =>
					JSON.parse(line) as { event: string; data: { status?: string } },
			);
		expect(events.some((event) => event.event === "node")).toBe(true);
		expect(events.at(-1)).toEqual({
			event: "result",
			data: { status: "Succeeded" },
		});
	}, 30_000);

	it("executes a top-level Procedure that contains exported declarations", async () => {
		app = await createApp({ filesFolder: "/tmp" });
		const exportedSource = `export function run() { console.log("ok"); }\nrun();`;
		const executionResponse = await app.inject({
			method: "POST",
			url: "/api/execute",
			payload: { source: exportedSource, filePath: "main.ts" },
		});
		const events = executionResponse.body
			.trim()
			.split("\n")
			.map(
				(line) =>
					JSON.parse(line) as {
						event: string;
						data: { status?: string; error?: string };
					},
			);
		expect(events.at(-1)).toEqual({
			event: "result",
			data: { status: "Succeeded" },
		});
	}, 30_000);
});
