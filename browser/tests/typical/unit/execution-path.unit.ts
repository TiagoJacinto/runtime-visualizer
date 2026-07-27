import { describe, expect, test } from "vitest";
import { buildExecutionPath } from "../../../src/execution-path.ts";

describe("buildExecutionPath", () => {
	test("follows the true branch once and reaches the terminal node", () => {
		expect(buildExecutionPath({
			entry: "entry",
			exit: "exit",
			nodes: [
				{ id: "entry", kind: "entry" },
				{ id: "prepare", kind: "statement" },
				{ id: "ready", kind: "branch" },
				{ id: "work", kind: "statement" },
				{ id: "wait", kind: "statement" },
				{ id: "exit", kind: "exit" },
			],
			edges: [
				{ from: "entry", to: "prepare" },
				{ from: "prepare", to: "ready" },
				{ from: "ready", to: "work", label: "true" },
				{ from: "ready", to: "wait", label: "false" },
				{ from: "work", to: "exit" },
				{ from: "wait", to: "exit" },
			],
		})).toEqual(["prepare", "ready", "work", "exit"]);
	});
});
