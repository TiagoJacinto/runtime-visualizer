import { describe, expect, test } from "vitest";
import { createApp } from "../../../src/app.ts";

type Diagnostic = { procedure: string; dependency?: string; reason: string };

describe("Diagnose control-flow graph generation", () => {
	test.each([
		["broken.ts", "const count: number = 'many'; work()", "Type checking failed"],
		["invalid.ts", "if (ready { work() }", "Syntax is invalid"],
		["legacy.ts", "with (settings) { work() }", "With statement is unsupported"],
	] as const)("rejects %s with a clear diagnostic and no partial graph", async (filePath, source, reason) => {
		const app = await createApp();
		const response = await app.inject({ method: "POST", url: "/api/cfg", payload: { filePath, source } });
		const body = response.json() as { cfg?: unknown; diagnostics?: Diagnostic[] };
		expect(response.statusCode).toBe(422);
		expect(body.cfg).toBeUndefined();
		expect(body.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ procedure: filePath, reason })]));
		await app.close();
	});

	test("rejects a required dependency type error without exposing a partial graph", async () => {
		const app = await createApp();
		const response = await app.inject({ method: "POST", url: "/api/cfg", payload: {
			filePath: "main.ts",
			source: "import { count } from './count'; work(count)",
			files: { "count.ts": "export const count: number = 'many'" },
		} });
		const body = response.json() as { cfg?: unknown; diagnostics?: Diagnostic[] };
		expect(response.statusCode).toBe(422);
		expect(body.cfg).toBeUndefined();
		expect(body.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ procedure: "main.ts", dependency: "count.ts", reason: "Type checking failed" })]));
		await app.close();
	});

	test("ignores diagnostics from unrelated Procedures", async () => {
		const app = await createApp();
		const response = await app.inject({ method: "POST", url: "/api/cfg", payload: {
			filePath: "main.ts",
			source: "work()",
			files: { "broken.ts": "const count: number = 'many'" },
		} });
		const body = response.json() as { cfg?: { procedures?: unknown[] }; diagnostics?: Diagnostic[] };
		expect(response.statusCode).toBe(200);
		expect(body.cfg?.procedures).toHaveLength(1);
		expect(body.diagnostics).toBeUndefined();
		await app.close();
	});
});
