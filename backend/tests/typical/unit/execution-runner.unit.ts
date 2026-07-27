import { describe, expect, test } from "vitest";
import { analyseFileProcedure } from "../../../src/cfg/file-analyzer.ts";
import { executeProcedure } from "../../../src/execution/runner.ts";

describe("executeProcedure", () => {
	test("emits the nodes taken by the runtime-selected branch", async () => {
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

		const result = await executeProcedure(source, "classify.ts", procedure);
		const labels = new Map(procedure.nodes.map((node) => [node.id, node.label]));
		expect(result.status).toBe("Succeeded");
		expect(result.events.map((event) => labels.get(event))).toEqual([
			"const ready = false;",
			"prepare()",
			"ready",
			"wait()",
		]);
	});

	test("awaits Promise delays before continuing through the Procedure", async () => {
		const source = [
			"function prepare() {}",
			"function work() {}",
			"prepare();",
			"await new Promise<void>((resolve) => setTimeout(resolve, 10));",
			"work();",
		].join("\n");
		const procedure = analyseFileProcedure(source, "delayed.ts").procedures?.[0];
		if (procedure === undefined) throw new Error("expected a file Procedure");

		const result = await executeProcedure(source, "delayed.ts", procedure);
		const labels = new Map(procedure.nodes.map((node) => [node.id, node.label]));
		expect(result.status).toBe("Succeeded");
		expect(result.events.map((event) => labels.get(event))).toEqual([
			"prepare()",
			"await new Promise<void>((resolve) => setTimeout(resolve, 10))",
			"work()",
		]);
	});
});
