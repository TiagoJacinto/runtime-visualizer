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
			expect(response.headers["content-type"]).toContain("application/x-ndjson");
			const events = response.body.split("\n").filter(Boolean).map((line) => JSON.parse(line) as {
				event: string;
				data: { nodeId?: string; status?: string };
			});
			expect(events.at(-1)).toEqual({ event: "result", data: { status: "Succeeded" } });
			expect(events.filter((event) => event.event === "node")).toHaveLength(5);
		} finally {
			await app.close();
		}
	});
});
