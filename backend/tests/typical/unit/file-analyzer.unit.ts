import { describe, expect, it } from "vitest";
import { analyseFileProcedure } from "../../../src/modules/cfg/useCases/analyseFile/file-analyzer.ts";

function procedureFor(
	source: string,
	filePath: string,
	options: { functionName?: string } = {},
) {
	const procedure = analyseFileProcedure(source, filePath, options)
		.procedures?.[0];
	if (procedure === undefined) throw new Error("Expected a Procedure graph");
	return procedure;
}

describe("file Procedure control-flow analysis", () => {
	it("keeps the file Procedure top-level unless a Function is explicitly selected", () => {
		const source = "function main() { work(); }\nwork();";
		const fileProcedure = procedureFor(source, "main.ts");
		const functionProcedure = procedureFor(source, "main.ts", {
			functionName: "main",
		});

		expect(fileProcedure.nodes.map((node) => node.label)).toEqual([
			"Entry",
			"work()",
			"Exit",
		]);
		expect(functionProcedure.nodes.map((node) => node.label)).toEqual([
			"Entry",
			"work()",
			"Exit",
		]);
		expect(fileProcedure.nodes[1]?.location?.start.line).toBe(2);
		expect(functionProcedure.nodes[1]?.location?.start.line).toBe(1);
	});

	it("selects a named Function Procedure and preserves source locations", () => {
		const procedure = procedureFor(
			"function calculate() {\n  const value = read()\n  return value\n}",
			"calculate.ts",
			{ functionName: "calculate" },
		);

		expect(procedure.nodes.map((node) => node.label)).toEqual([
			"Entry",
			"const value = read()",
			"return value",
			"Exit",
		]);
		expect(procedure.nodes[1]?.location?.start.line).toBe(2);
		expect(procedure.nodes[2]?.location?.start.line).toBe(3);
	});

	it("keeps runtime-visible debugger and generator suspension statements", () => {
		const procedure = procedureFor(
			"function* flow(first: unknown, rest: Iterable<unknown>) { ; debugger; yield first; yield* rest }",
			"flow.ts",
			{ functionName: "flow" },
		);

		const labels = procedure.nodes.map((node) => node.label);
		expect(labels).toContain("debugger");
		expect(labels).toContain("yield first");
		expect(labels).toContain("yield* rest");
		expect(labels).not.toContain(";");
	});

	it("creates semantic decisions for logical assignment operators", () => {
		const procedure = procedureFor(
			"ready &&= work(); ready ||= fallback(); value ??= fallback()",
			"expression.ts",
		);

		const decisions = procedure.nodes.filter((node) => node.kind === "branch");
		expect(decisions.map((node) => node.label)).toEqual([
			"ready",
			"ready",
			"value",
		]);
		expect(procedure.edges.map((edge) => edge.label).filter(Boolean)).toEqual([
			"truthy",
			"falsy",
			"falsy",
			"nullish",
			"truthy",
			"not-nullish",
		]);
	});

	it("represents executable class initialization without nested method bodies", () => {
		const procedure = procedureFor(
			'class Worker extends makeBase() { static [key ?? "field"]() {} static initialized = initialize(); static ready; static { register() } declare static typeOnly: string; run() { work() } }',
			"worker.ts",
		);

		const labels = procedure.nodes.map((node) => node.label);
		expect(labels).toEqual([
			"Entry",
			"makeBase()",
			"key",
			'"field"',
			"static initialized = initialize()",
			"static ready",
			"register()",
			"Exit",
		]);
		expect(labels).not.toContain("class Worker");
		expect(labels).not.toContain("declare static typeOnly: string");
		expect(labels).not.toContain("work()");
	});
});
