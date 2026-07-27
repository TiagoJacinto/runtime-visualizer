import { describe, expect, test } from "vitest";
import { createApp } from "../../../src/app.ts";

describe("POST /api/execute", () => {
	test("returns runtime events and a terminal Result", async () => {
		const app = await createApp();
		try {
			const response = await app.inject({
				method: "POST",
				url: "/api/execute",
				payload: {
					filePath: "classify.ts",
					source: [
						"const ready = true;",
						"function prepare() {}",
						"function work() {}",
						"function wait() {}",
						"prepare();",
						"await new Promise<void>((resolve) => setTimeout(resolve, 10));",
						"if (ready) { work(); } else { wait(); }",
						"export {};",
					].join("\n"),
				},
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toMatchObject({
			ok: true,
			result: { status: "Succeeded" },
		});
			expect(response.json().events).toHaveLength(5);
		} finally {
			await app.close();
		}
	});
});
