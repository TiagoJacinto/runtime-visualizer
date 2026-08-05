import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "../../../src/app.js";

type FileChange = {
	type: "file-changed";
	file: string;
	change: "added" | "modified" | "deleted";
	revision?: string;
};

async function nextEvent(response: Response): Promise<FileChange> {
	if (response.body === null) throw new Error("Expected an SSE response body");
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let text = "";
	const deadline = Date.now() + 2000;
	while (!text.includes("data: ")) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) throw new Error("Timed out waiting for file change");
		const result = await Promise.race([
			reader.read(),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error("Timed out waiting for file change")),
					remaining,
				),
			),
		]);
		if (result.done) throw new Error("SSE stream closed before file change");
		text += decoder.decode(result.value, { stream: true });
	}
	await reader.cancel();
	const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
	if (dataLine === undefined) throw new Error("Expected an SSE data line");
	return JSON.parse(dataLine.slice("data: ".length)) as FileChange;
}

describe("source change SSE", () => {
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let folder: string | undefined;

	afterEach(async () => {
		await app?.close();
		if (folder !== undefined)
			await fs.rm(folder, { recursive: true, force: true });
		app = undefined;
		folder = undefined;
	});

	it("detects a change immediately after connecting", async () => {
		folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
		await fs.writeFile(
			path.join(folder, "main.ts"),
			"export const value = 1;\n",
		);
		app = await createApp({ filesFolder: folder });
		const address = await app.listen({ port: 0, host: "127.0.0.1" });

		const response = await fetch(`${address}/api/events`);
		await fs.writeFile(
			path.join(folder, "main.ts"),
			"export const value = 2;\n",
		);
		const change = await nextEvent(response);

		expect(change).toMatchObject({
			type: "file-changed",
			file: "main.ts",
			change: "modified",
		});
	});

	it("publishes added, modified, and deleted source changes", async () => {
		folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
		await fs.writeFile(
			path.join(folder, "main.ts"),
			"export const value = 1;\n",
		);
		app = await createApp({ filesFolder: folder });
		const address = await app.listen({ port: 0, host: "127.0.0.1" });

		const addedResponse = await fetch(`${address}/api/events`);
		await new Promise((resolve) => setTimeout(resolve, 250));
		await fs.writeFile(
			path.join(folder, "new.ts"),
			"export const value = 2;\n",
		);
		const added = await nextEvent(addedResponse);

		const modifiedResponse = await fetch(`${address}/api/events`);
		await new Promise((resolve) => setTimeout(resolve, 250));
		await fs.writeFile(
			path.join(folder, "main.ts"),
			"export const value = 3;\n",
		);
		const modified = await nextEvent(modifiedResponse);

		const deletedResponse = await fetch(`${address}/api/events`);
		await new Promise((resolve) => setTimeout(resolve, 250));
		await fs.rm(path.join(folder, "main.ts"));
		const deleted = await nextEvent(deletedResponse);

		// result verification
		expect(added).toMatchObject({
			type: "file-changed",
			file: "new.ts",
			change: "added",
		});
		expect(added.revision).toEqual(expect.any(String));
		expect(modified).toMatchObject({
			type: "file-changed",
			file: "main.ts",
			change: "modified",
		});
		expect(modified.revision).toEqual(expect.any(String));
		expect(deleted).toEqual({
			type: "file-changed",
			file: "main.ts",
			change: "deleted",
		});
	});
});
