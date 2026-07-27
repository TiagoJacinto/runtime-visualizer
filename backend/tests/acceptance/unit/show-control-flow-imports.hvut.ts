import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { analyseFileProcedure } from "../../../src/cfg/file-analyzer.ts";
import type { ControlFlowGraph } from "../../../src/cfg/types.ts";

const feature = await loadFeature(
	new URL("../../../../features/show-control-flow-imports.feature", import.meta.url).pathname,
);

describeFeature(feature, ({ Scenario }) => {
	Scenario("Hide imports by default", ({ Given, When, Then, And }) => {
		let source = "";
		let graph: ControlFlowGraph;

		Given(
			'Procedure{name: "main.ts", kind: File, status: Ready, source: {string}}',
			(_ctx, procedureSource: string) => {
				source = procedureSource;
			},
		);
		When('I visualizeControlFlow(procedure: "main.ts")', () => {
			graph = analyseFileProcedure(source, "main.ts");
		});
		Then(
			'I view Import{source: "import { helper } from \'./helper\'"} not in ControlFlowGraph: Imports do not appear by default',
			() => {
				expect(graph.procedures?.[0]?.nodes.some((node) => node.kind === "import")).toBe(false);
			},
		);
		And(
			'I view GraphNode{label: "helper()", kind: Executable} in ControlFlowGraph: Local flow remains visible',
			() => {
				expect(graph.procedures?.[0]?.nodes).toContainEqual(
				expect.objectContaining({ label: "helper()", kind: "statement" }),
				);
			},
		);
	});

	Scenario("Show current-file imports as context", ({ Given, When, Then, And }) => {
		let source = "";
		let showImports = false;
		let graph: ControlFlowGraph;

		Given(
			'current:Procedure{name: "main.ts", kind: File, status: Ready, source: {string}}',
			(_ctx, procedureSource: string) => {
				source = procedureSource;
			},
		);
		And(
			'imported:Procedure{name: "helper.ts", kind: File, status: Ready, source: {string}}',
			() => undefined,
		);
		And("Import{visibility: Visible}", () => {
			showImports = true;
		});
		When('I visualizeControlFlow(procedure: "main.ts")', () => {
			graph = analyseFileProcedure(source, "main.ts", { showImports });
		});
		Then(
			'I view Import{source: "import { helper } from \'./helper\'"} in ControlFlowGraph: The current file\'s dependency context is visible',
			() => {
				expect(graph.procedures?.[0]?.nodes).toContainEqual(
					expect.objectContaining({ kind: "import", label: "import { helper } from './helper'" }),
				);
			},
		);
		And(
			'I view ControlFlowTransition{from: "import { helper } from \'./helper\'", to: "helper()"} not in ControlFlowGraph: Contextual imports do not become local execution flow',
			() => {
				const procedure = graph.procedures?.[0];
				const importNode = procedure?.nodes.find((node) => node.kind === "import");
				const helperNode = procedure?.nodes.find((node) => node.label === "helper()");
				expect(procedure?.edges.some((edge) => edge.from === importNode?.id || edge.to === importNode?.id)).toBe(false);
				expect(importNode).toBeDefined();
				expect(helperNode).toBeDefined();
			},
		);
		And(
			'I view GraphNode{label: "helper()", kind: Executable} in ControlFlowGraph: The local call remains one node',
			() => {
				expect(graph.procedures?.[0]?.nodes.filter((node) => node.label === "helper()")).toHaveLength(1);
			},
		);
		And(
			'I view GraphNode{label: "work()"} not in ControlFlowGraph: The imported Procedure is not expanded',
			() => {
				expect(graph.procedures?.[0]?.nodes.some((node) => node.label === "work()")).toBe(false);
			},
		);
	});
});
