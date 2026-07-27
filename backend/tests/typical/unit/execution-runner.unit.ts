import { describe, expect, test } from "vitest";
import { analyseFileProcedure } from "../../../src/cfg/file-analyzer.ts";
import { executeProcedure } from "../../../src/execution/runner.ts";

describe("executeProcedure", () => {
	test("emits the nodes taken by the runtime-selected branch", () => {
		const source = [
			"const ready = false;",
			"function prepare() {}",
			"function work() {}",
			"function wait() {}",
			"prepare();",
			"if (ready) { work(); } else { wait(); }",
		].join("\n");
		const procedure = analyseFileProcedure(source, "classify.ts").procedures?.[0];
		if (procedure === undefined) throw new Error("expected a file Procedure");

		const result = executeProcedure(source, "classify.ts", procedure);
		const labels = new Map(procedure.nodes.map((node) => [node.id, node.label]));
		expect(result.status).toBe("Succeeded");
		expect(result.events.map((event) => labels.get(event))).toEqual([
			"const ready = false;",
			"prepare()",
			"ready",
			"wait()",
		]);
	});
});
