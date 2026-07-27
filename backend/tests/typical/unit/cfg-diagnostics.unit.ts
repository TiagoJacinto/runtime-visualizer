import { describe, expect, test } from "vitest";
import { diagnoseProject } from "../../../src/cfg/diagnostics.ts";

describe("diagnoseProject", () => {
	test("does not let an uploaded duplicate replace the selected source", () => {
		const diagnostics = diagnoseProject({
			filePath: "main.ts",
			source: "const value: number = 'many'",
			files: { "main.ts": "work()" },
		});
		expect(diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ procedure: "main.ts", reason: "Type checking failed" })]));
	});

	test("keeps unresolved types as type-checking failures", () => {
		const diagnostics = diagnoseProject({ filePath: "broken.ts", source: "const value: MissingType = 1" });
		expect(diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "Type checking failed" })]));
	});

	test("diagnoses selected and imported source while ignoring unrelated files", () => {
		const diagnostics = diagnoseProject({
			filePath: "main.ts",
			source: "import { count } from './count'; work(count)",
			files: {
				"count.ts": "export const count: number = 'many'",
				"unrelated.ts": "const broken: number = 'many'",
			},
		});
		expect(diagnostics).toEqual(expect.arrayContaining([
			expect.objectContaining({ procedure: "main.ts", dependency: "count.ts", reason: "Type checking failed" }),
		]));
		expect(diagnostics).not.toEqual(expect.arrayContaining([
			expect.objectContaining({ dependency: "unrelated.ts" }),
		]));
	});
});
