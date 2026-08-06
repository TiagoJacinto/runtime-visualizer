import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, expect } from "vitest";
import { createApp } from "../../../src/shared/infra/http/app.ts";
import type { GraphDiagnostic } from "../../../src/modules/cfg/types.ts";

const feature = await loadFeature(
	new URL(
		"../../../../features/compose-multi-file-program.feature",
		import.meta.url,
	).pathname,
);

describeFeature(feature, ({ Scenario }) => {
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let folder: string | undefined;

	afterEach(async () => {
		await app?.close();
		if (folder !== undefined)
			await fs.rm(folder, { recursive: true, force: true });
		app = undefined;
		folder = undefined;
	});

	Scenario(
		"Resolve an import from another file Procedure",
		({ Given, When, Then, And }) => {
			let source = "";
			let dependencySource = "";
			let diagnostics: GraphDiagnostic[];
			let graph: {
				procedures?: Array<{ nodes: Array<{ label: string; kind: string }> }>;
			};
			let revision = "";

			Given(
				'selected:Procedure{name: "main.ts", kind: File, status: Ready, source: {string}}',
				(_, procedureSource: string) => {
					source = procedureSource;
				},
			);
			And(
				'dependency:Procedure{name: "helper.ts", kind: File, status: Ready, source: {string}}',
				(_, procedureSource: string) => {
					dependencySource = procedureSource;
				},
			);
			When('I visualizeControlFlow(procedure: "main.ts")', async () => {
				folder = await fs.mkdtemp(
					path.join(os.tmpdir(), "runtime-visualizer-"),
				);
				await fs.writeFile(path.join(folder, "main.ts"), source);
				await fs.writeFile(path.join(folder, "helper.ts"), dependencySource);
				app = await createApp({ filesFolder: folder });
				const response = await app.inject({
					method: "GET",
					url: "/api/cfg?file=main.ts",
				});
				const body = response.json<{
					diagnostics?: GraphDiagnostic[];
					revision?: string;
					cfg?: typeof graph;
				}>();
				diagnostics = body.diagnostics ?? [];
				if (response.statusCode !== 200 || body.cfg === undefined)
					throw new Error(
						`expected a control-flow graph, got ${response.statusCode}`,
					);
				revision = body.revision ?? "";
				graph = body.cfg;
			});
			Then(
				'I view GraphNode{label: "helper()", kind: Executable} in ControlFlowGraph: The selected Procedure retains its executable call',
				() => {
					expect(graph.procedures?.[0]?.nodes).toContainEqual(
						expect.objectContaining({ label: "helper()", kind: "statement" }),
					);
				},
			);
			And(
				'I view GraphDiagnostic{reason: "Required dependency could not be resolved", dependency: "helper.ts"} not in ControlFlowGraph: The imported Procedure resolves successfully',
				() => {
					// result verification
					expect(diagnostics).toEqual([]);
					expect(revision).toMatch(/^[a-f0-9]{64}$/);
				},
			);
		},
	);
});
