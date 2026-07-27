import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app.ts";

describe("control-flow graph diagnostics", () => {
	test("rejects selected type errors without a partial graph", async () => {
		const app = await createApp();
		const response = await app.inject({ method: "POST", url: "/api/cfg", payload: { filePath: "broken.ts", source: "const count: number = 'many';" } });
		expect(response.statusCode).toBe(422);
		const body = response.json() as { cfg?: unknown; diagnostics: Array<{ procedure: string; reason: string }> };
		expect(body.cfg).toBeUndefined();
		expect(body.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ procedure: "broken.ts", reason: "Type checking failed" })]));
		await app.close();
	});

	test("reports syntax and unsupported with diagnostics", async () => {
		const app = await createApp();
		for (const [filePath, source, reason] of [
			["invalid.ts", "if (ready { work() }", "Syntax is invalid"],
			["legacy.ts", "with (settings) { work() }", "With statement is unsupported"],
		] as const) {
			const response = await app.inject({ method: "POST", url: "/api/cfg", payload: { filePath, source } });
			expect(response.statusCode).toBe(422);
			expect(response.json().diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ procedure: filePath, reason })]));
		}
		await app.close();
	});

	test("reports a required dependency type error", async () => {
		const app = await createApp();
		const response = await app.inject({ method: "POST", url: "/api/cfg", payload: {
			filePath: "main.ts",
			source: "import { count } from './count'; declare function work(value: number): void; work(count);",
			files: { "count.ts": "export const count: number = 'many';" },
		} });
		expect(response.statusCode).toBe(422);
		expect(response.json().diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ procedure: "main.ts", dependency: "count.ts", reason: "Type checking failed" })]));
		await app.close();
	});

	test("ignores unrelated type errors for a valid selected procedure", async () => {
		const app = await createApp();
		const response = await app.inject({ method: "POST", url: "/api/cfg", payload: {
			filePath: "main.ts",
			source: "declare function work(): void; work();",
			files: { "broken.ts": "const count: number = 'many';" },
		} });
		expect(response.statusCode).toBe(200);
		expect(response.json().cfg?.procedures).toHaveLength(1);
		expect(response.json().diagnostics).toBeUndefined();
		await app.close();
	});
});
