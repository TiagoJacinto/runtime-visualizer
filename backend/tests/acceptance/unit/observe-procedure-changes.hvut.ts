import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, expect } from "vitest";
import { createApp } from "../../../src/shared/infra/http/app.ts";

type FileChange = {
	type: "file-changed";
	file: string;
	change: "added" | "modified" | "deleted";
	revision?: string;
};

const feature = await loadFeature(
	new URL("../../../features/observe-procedure-changes.feature", import.meta.url)
		.pathname,
);

async function nextEvent(response: Response): Promise<FileChange> {
	if (response.body === null) throw new Error("Expected an SSE response body");
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const deadline = Date.now() + 2000;
	try {
		while (Date.now() < deadline) {
			const result = await Promise.race([
				reader.read(),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error("Timed out waiting for file change")),
						deadline - Date.now(),
					),
				),
			]);
			if (result.done) throw new Error("SSE stream closed before file change");
			buffer += decoder.decode(result.value, { stream: true });
			const records = buffer.split("\n\n");
			buffer = records.pop() ?? "";
			for (const record of records) {
				if (!record.split("\n").includes("event: source-change")) continue;
				const dataLine = record
					.split("\n")
					.find((line) => line.startsWith("data: "));
				if (dataLine !== undefined) {
					const payload = JSON.parse(dataLine.slice("data: ".length)) as { type: "source-change"; change: FileChange };
					return payload.change;
				}
			}
		}
		throw new Error("Timed out waiting for file change");
	} finally {
		await reader.cancel();
	}
}

async function openEvents(
	folder: string,
): Promise<{ app: Awaited<ReturnType<typeof createApp>>; response: Response }> {
	const app = await createApp({ filesFolder: folder });
	const address = await app.listen({ port: 0, host: "127.0.0.1" });
	return { app, response: await fetch(`${address}/api/events`) };
}

describeFeature(feature, ({ Rule }) => {
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let response: Response | undefined;
	let folder: string | undefined;

	afterAll(async () => {
		await app?.close();
		if (folder !== undefined)
			await fs.rm(folder, { recursive: true, force: true });
	});

	Rule(
		"Source changes are observable as additions, modifications, and deletions",
		({ RuleScenario, RuleScenarioOutline }) => {
			RuleScenarioOutline(
				"Observe a source file change",
				async (
					{ Given, When, Then },
					example: Record<string, string | undefined>,
				) => {
					Given('Source folder{files: ["main.ts"], revision: "R1"}', async () => {
						folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
						await fs.writeFile(
							path.join(folder, "main.ts"),
							"export const value = 1;\n",
						);
					});
					When("I observeSourceChanges()", async () => {
						if (folder === undefined) throw new Error("Expected a source folder");
						({ app, response } = await openEvents(folder));
						await new Promise((resolve) => setTimeout(resolve, 300));
						if (example.change === "Added")
							await fs.writeFile(
								path.join(folder, "new.ts"),
								"export const value = 2;\n",
							);
						else if (example.change === "Modified")
							await fs.writeFile(
								path.join(folder, "main.ts"),
								"export const value = 2;\n",
							);
						else await fs.rm(path.join(folder, "main.ts"));
					});
					Then(
						"I view File change{file: <file>, change: <change>, revision: <revision>} in Source change stream: The source change is published",
						async () => {
							if (response === undefined) throw new Error("Expected an SSE response");
							const change = await nextEvent(response);
							const expectedFile = example.file ?? "";
							const expectedChange = example.change ?? "";
							// result verification
							expect(change.file).toBe(expectedFile.replaceAll('"', ""));
							expect(change.change).toBe(expectedChange.toLowerCase());
							if (expectedChange === "Deleted")
								expect(change.revision).toBeUndefined();
							else expect(change.revision).toEqual(expect.any(String));
						},
					);
				},
			);

			RuleScenario(
				"Publish the latest revision with a modification",
				({ Given, When, Then }) => {
					let change: FileChange;
					Given(
						'Source file{path: "main.ts", revision: "R1", source: "function prepare() {}"}',
						async () => {
							folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
							await fs.writeFile(
								path.join(folder, "main.ts"),
								"function prepare() {}\n",
							);
						},
					);
					When("I observeSourceChanges()", async () => {
						if (folder === undefined) throw new Error("Expected a source folder");
						({ app, response } = await openEvents(folder));
						await new Promise((resolve) => setTimeout(resolve, 300));
						await fs.writeFile(
							path.join(folder, "main.ts"),
							"function prepare() { return 1; }\n",
						);
						if (response === undefined) throw new Error("Expected an SSE response");
						change = await nextEvent(response);
					});
					Then(
						'I view File change{file: "main.ts", change: Modified, revision: "R2"} in Source change stream: The changed file has a new revision',
						() => {
							// result verification
							expect(change).toMatchObject({
								file: "main.ts",
								change: "modified",
							});
							expect(change.revision).toEqual(expect.any(String));
						},
					);
				},
			);
		},
	);
});
