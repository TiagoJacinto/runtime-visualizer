import { afterEach, describe, expect, test } from "bun:test";
import { createApp } from "../src/app.ts";

let app: Awaited<ReturnType<typeof createApp>> | undefined;

afterEach(async () => {
	await app?.close();
	app = undefined;
});

describe("visualizeControlFlow application boundary", () => {
	test("returns the selected Procedure graph for a branch", async () => {
		app = await createApp({ filesFolder: "." });
		const response = await app.inject({
			method: "POST",
			url: "/api/cfg",
			payload: { source: "if (ready) { work() } else { wait() }", filePath: "classify.ts" },
		});

		expect(response.statusCode).toBe(200);
		const body = response.json() as {
			ok: boolean;
			cfg: { procedures: Array<{ nodes: Array<{ label: string }>; edges: Array<{ label?: string }> }> };
		};
		expect(body.ok).toBe(true);
		expect(body.cfg.procedures[0]?.nodes.map((node) => node.label)).toEqual([
			"Entry",
			"ready",
			"work()",
			"wait()",
			"Exit",
		]);
	});
});
