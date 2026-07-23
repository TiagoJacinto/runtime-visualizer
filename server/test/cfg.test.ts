import { describe, expect, it } from "bun:test";
import { createApp } from "../src/app.ts";
import { call } from "./helpers.ts";

describe("POST /api/cfg", () => {
	it("builds an empty file Procedure from Entry directly to Exit", async () => {
		const response = await call(await createApp(), "POST", "/api/cfg", { source: "", filePath: "empty.ts" });
		expect(response.status).toBe(200);
		const body = response.body as {
			cfg: {
				procedures: Array<{
					nodes: Array<{ label: string }>;
					edges: Array<{ from: string; to: string; kind: string }>;
				}>;
			};
		};
		const procedure = body.cfg.procedures[0]!;
		expect(procedure.nodes.map((node) => node.label)).toEqual(["Entry", "Exit"]);
		expect(procedure.edges).toEqual([{ from: "entry", to: "exit", kind: "next" }]);
	});

	it("represents executable top-level statements with source locations", async () => {
		const response = await call(await createApp(), "POST", "/api/cfg", { source: "const value = read()\nwrite(value)", filePath: "work.ts" });
		expect(response.status).toBe(200);
		const body = response.body as {
			cfg: {
				procedures: Array<{
					nodes: Array<{
						label: string;
						location?: { start: { line: number }; end: { line: number } };
					}>;
				}>;
			};
		};
		const nodes = body.cfg.procedures[0]!.nodes;
		expect(nodes.map((node) => node.label)).toEqual(["Entry", "const value = read()", "write(value)", "Exit"]);
		expect(nodes[1]!.location?.start.line).toBe(1);
		expect(nodes[2]!.location?.end.line).toBe(2);
	});
});
