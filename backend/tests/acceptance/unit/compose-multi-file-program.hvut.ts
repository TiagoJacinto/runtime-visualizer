import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { diagnoseProject } from "../../../src/cfg/diagnostics.ts";
import { analyseFileProcedure } from "../../../src/cfg/file-analyzer.ts";
import type { ControlFlowGraph } from "../../../src/cfg/types.ts";

const feature = await loadFeature(
	new URL("../../../../features/compose-multi-file-program.feature", import.meta.url).pathname,
);

describeFeature(feature, ({ Scenario }) => {
	Scenario("Resolve an import from another file Procedure", ({ Given, When, Then, And }) => {
		let source = "";
		let dependencySource = "";
		let diagnostics: ReturnType<typeof diagnoseProject>;
		let graph: ControlFlowGraph;

		Given(
			'selected:Procedure{name: "main.ts", kind: File, status: Ready, source: {string}}',
			(_ctx, procedureSource: string) => {
				source = procedureSource;
			},
		);
		And(
			'dependency:Procedure{name: "helper.ts", kind: File, status: Ready, source: {string}}',
			(_ctx, procedureSource: string) => {
				dependencySource = procedureSource;
			},
		);
		When('I visualizeControlFlow(procedure: "main.ts")', () => {
			diagnostics = diagnoseProject({
				source,
				filePath: "main.ts",
				files: { "helper.ts": dependencySource },
			});
			graph = analyseFileProcedure(source, "main.ts");
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
				expect(diagnostics).toEqual([]);
			},
		);
	});
});
