import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
	analyseProject,
	type ControlFlowGraph,
	type GraphDiagnostic,
} from "../../../src/modules/cfg/index.ts";
import { sourceRevision } from "../../../src/modules/source/index.ts";

const feature = await loadFeature(
	new URL(
		"../../../../features/compose-multi-file-program.feature",
		import.meta.url,
	).pathname,
);

describeFeature(feature, ({ Scenario }) => {
	Scenario(
		"Resolve an import from another file Procedure",
		({ Given, When, Then, And }) => {
			let source = "";
			let dependencySource = "";
			let diagnostics: GraphDiagnostic[];
			let graph: ControlFlowGraph;
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
			When('I visualizeControlFlow(procedure: "main.ts")', () => {
				const result = analyseProject({
					source,
					filePath: "main.ts",
					files: { "main.ts": source, "helper.ts": dependencySource },
				});
				diagnostics = result.diagnostics;
				if (result.cfg === undefined)
					throw new Error("expected a control-flow graph");
				graph = result.cfg;
				revision = sourceRevision(source);
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
