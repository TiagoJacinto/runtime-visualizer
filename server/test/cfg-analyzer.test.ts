import { describe, expect, test } from "bun:test";
import { analyseFileProcedure } from "../src/cfg/file-analyzer.ts";

function graph(source: string, filePath = "inline.ts") {
	return analyseFileProcedure(source, filePath).procedures?.[0] ?? (() => {
		throw new Error("expected a file procedure");
	})();
}

function nodeLabels(source: string) {
	return graph(source).nodes.map((node) => node.label);
}

function edgeLabels(source: string, filePath = "inline.ts") {
	const procedure = graph(source, filePath);
	const labels = new Map(procedure.nodes.map((node) => [node.id, node.label]));
	return procedure.edges.map((edge) => ({
		from: labels.get(edge.from),
		outcome: edge.label ?? "",
		to: labels.get(edge.to),
	}));
}

function expectEdge(source: string, edge: { from: string; outcome?: string; to: string }, filePath?: string) {
	expect(edgeLabels(source, filePath)).toContainEqual({ from: edge.from, outcome: edge.outcome ?? "", to: edge.to });
}

describe("file Procedure control-flow analysis", () => {
	test("represents both paths through an if decision", () => {
		expect(nodeLabels("if (ready) { work() } else { wait() }")).toEqual([
			"Entry",
			"ready",
			"work()",
			"wait()",
			"Exit",
		]);
		expect(edgeLabels("if (ready) { work() } else { wait() }")).toEqual(expect.arrayContaining([
			{ from: "Entry", outcome: "", to: "ready" },
			{ from: "ready", outcome: "true", to: "work()" },
			{ from: "ready", outcome: "false", to: "wait()" },
			{ from: "work()", outcome: "", to: "Exit" },
			{ from: "wait()", outcome: "", to: "Exit" },
		]));
	});

	test("routes loop jumps and finally cleanup", () => {
		const edges = edgeLabels("while (ready) { try { continue } finally { cleanup() } } after()");
		expect(edges).toEqual(expect.arrayContaining([
			{ from: "ready", outcome: "true", to: "continue" },
			{ from: "continue", outcome: "", to: "cleanup()" },
			{ from: "cleanup()", outcome: "", to: "ready" },
			{ from: "ready", outcome: "false", to: "after()" },
		]));
	});

	test("models expression decisions without including nested procedure bodies", () => {
		const procedure = graph("const helper = () => work(); helper()");
		expect(nodeLabels("ready && work()")).toEqual(["Entry", "ready", "work()", "Exit"]);
		expect(procedure.nodes.map((node) => node.label)).toContain("helper()");
		expect(procedure.nodes.map((node) => node.label)).not.toContain("work()");
	});

	test("models runtime class initialization and omits erased syntax", () => {
		const source = "interface Job {} type JobId = string; class Worker extends makeBase() { static [key ?? fallback()] = initialize(); static ready; static { register() } declare static typeOnly: string; run() { work() } }";
		const labels = nodeLabels(source);
		expect(labels).toEqual(expect.arrayContaining([
			"makeBase()",
			"key",
			"fallback()",
			"static [key ?? fallback()] = initialize()",
			"static ready",
			"register()",
		]));
		expect(labels).not.toEqual(expect.arrayContaining(["class Worker", "work()", "interface Job {}", "type JobId = string"]));
		expectEdge(source, { from: "key", outcome: "nullish", to: "fallback()" });
		expectEdge(source, { from: "key", outcome: "not-nullish", to: "static [key ?? fallback()] = initialize()" });
	});

	test("connects an empty Procedure directly from Entry to Exit", () => {
		expect(nodeLabels("")).toEqual(["Entry", "Exit"]);
		expectEdge("", { from: "Entry", to: "Exit" });
	});

	test("preserves switch fall-through and resolves break", () => {
		const source = "switch (kind) { case 'a': first(); case 'b': second(); break; default: other() } done()";
		expectEdge(source, { from: "kind", outcome: "case 'a'", to: "first()" });
		expectEdge(source, { from: "kind", outcome: "case 'b'", to: "second()" });
		expectEdge(source, { from: "kind", outcome: "default", to: "other()" });
		expectEdge(source, { from: "first()", to: "second()" });
		expectEdge(source, { from: "break", to: "done()" });
		expectEdge(source, { from: "other()", to: "done()" });
		expect(edgeLabels(source)).not.toContainEqual({ from: "kind", outcome: "", to: "done()" });
	});

	test("retains an empty branch path while preserving the alternate branch", () => {
		const source = "if (ready); else skipped(); after()";
		expectEdge(source, { from: "ready", outcome: "true", to: "after()" });
		expectEdge(source, { from: "ready", outcome: "false", to: "skipped()" });
		expectEdge(source, { from: "skipped()", to: "after()" });
	});

	test("models for phases and do-while entry", () => {
		const source = "for (let i = 0; i < 3; i++) { continue } after()";
		expectEdge(source, { from: "let i = 0", to: "i < 3" });
		expectEdge(source, { from: "i < 3", outcome: "true", to: "continue" });
		expectEdge(source, { from: "continue", to: "i++" });
		expectEdge(source, { from: "i++", to: "i < 3" });
		expectEdge(source, { from: "i < 3", outcome: "false", to: "after()" });
		expectEdge("do { attempt() } while (retry); finish()", { from: "Entry", to: "attempt()" });
		expectEdge("do { attempt() } while (retry); finish()", { from: "attempt()", to: "retry" });
	});

	test("exposes iteration alternatives and labeled jumps", () => {
		const source = "for (const item of values) { work(item) } after()";
		expectEdge(source, { from: "values items", outcome: "next item", to: "work(item)" });
		expectEdge(source, { from: "values items", outcome: "iteration end", to: "after()" });
		expectEdge("outer: while (ready) { break outer } done()", { from: "break outer", to: "done()" });
		expect(nodeLabels("outer: while (ready) { break outer } done()")).not.toContain("outer");
	});

	test("routes explicit throws and abrupt paths through finally", () => {
		const source = "function recover(failed: boolean, error: Error) { try { if (failed) throw error; work() } catch { recoverWork() } finally { cleanup() } }";
		expectEdge(source, { from: "throw error", to: "recoverWork()" }, "recover");
		expectEdge(source, { from: "recoverWork()", to: "cleanup()" }, "recover");
		expectEdge(source, { from: "work()", to: "cleanup()" }, "recover");
		expectEdge(source, { from: "cleanup()", to: "Exit" }, "recover");
		expectEdge("function fail(error: Error) { throw error }", { from: "throw error", to: "Exit" }, "fail");
	});

	test("labels all supported expression decisions", () => {
		for (const [source, decision, first, second] of [
			["ready && work()", "ready", "truthy", "falsy"],
			["ready || fallback()", "ready", "falsy", "truthy"],
			["value ?? fallback()", "value", "nullish", "not-nullish"],
			["condition ? left() : right()", "condition", "true", "false"],
			["callback?.()", "callback", "not-nullish", "nullish"],
		] as const) {
			const edges = edgeLabels(source);
			expect(edges.some((edge) => edge.from === decision && edge.outcome === first)).toBe(true);
			expect(edges.some((edge) => edge.from === decision && edge.outcome === second)).toBe(true);
		}
	});
});
