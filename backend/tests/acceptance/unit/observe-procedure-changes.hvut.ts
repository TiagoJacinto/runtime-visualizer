import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, expect } from "vitest";
import {
	SourceChangeWatcher,
	type SourceChange,
} from "../../../src/modules/source/index.ts";

type FileChange = SourceChange;

const feature = await loadFeature(
	new URL("../../../features/observe-procedure-changes.feature", import.meta.url)
		.pathname,
);

let watcher: SourceChangeWatcher | undefined;
let changes: FileChange[] = [];

async function nextEvent(): Promise<FileChange> {
	const deadline = Date.now() + 2000;
	while (Date.now() < deadline) {
		const change = changes.shift();
		if (change !== undefined) return change;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error("Timed out waiting for file change");
}

async function openEvents(folder: string): Promise<void> {
	watcher?.close();
	changes = [];
	watcher = new SourceChangeWatcher(folder, 50);
	watcher.subscribe((change) => changes.push(change));
	await new Promise((resolve) => setTimeout(resolve, 300));
}

describeFeature(feature, ({ Rule }) => {
	let folder: string | undefined;

	afterAll(async () => {
		watcher?.close();
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
						await openEvents(folder);
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
							const change = await nextEvent();
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
						await openEvents(folder);
						await fs.writeFile(
							path.join(folder, "main.ts"),
							"function prepare() { return 1; }\n",
						);
						change = await nextEvent();
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
