import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "../../../src/app.ts";

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
});
