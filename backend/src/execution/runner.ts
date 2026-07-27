import vm from "node:vm";
import * as ts from "typescript";
import type { CfgNode, ProcedureCfg } from "../cfg/types.ts";

export type ExecutionResult = {
	readonly status: "Succeeded" | "Failed";
	readonly events: ReadonlyArray<string>;
	readonly error?: string;
};

type Patch = { readonly position: number; readonly text: string };

/** Execute a selected file Procedure and report the graph nodes reached at runtime. */
export async function executeProcedure(
	source: string,
	filePath: string,
	procedure: ProcedureCfg,
): Promise<ExecutionResult> {
	const events: string[] = [];
	try {
		const instrumented = instrument(source, filePath, procedure);
		const javascript = ts.transpileModule(instrumented, {
			compilerOptions: {
				target: ts.ScriptTarget.ES2022,
				module: ts.ModuleKind.None,
			},
			fileName: filePath,
		}).outputText;
		const context = vm.createContext({
			__visualizerEmit: (nodeId: string) => events.push(nodeId),
			setTimeout,
			clearTimeout,
		});
		const script = new vm.Script(`(async () => {\n${javascript}\n})()`, { filename: filePath });
		const result = script.runInContext(context, { timeout: 1_000 });
		await waitForCompletion(result);
		return { status: "Succeeded", events };
	} catch (cause) {
		return {
			status: "Failed",
			events,
			error: cause instanceof Error ? cause.message : String(cause),
		};
	}
}

async function waitForCompletion(result: unknown): Promise<void> {
	if (!isPromiseLike(result)) return;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			result,
			new Promise<never>((_resolve, reject) => {
				timeout = setTimeout(() => reject(new Error("Execution timed out.")), 1_000);
			}),
		]);
	} finally {
		if (timeout !== undefined) clearTimeout(timeout);
	}
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return typeof value === "object" && value !== null && "then" in value && typeof value.then === "function";
}

function instrument(source: string, filePath: string, procedure: ProcedureCfg): string {
	const file = ts.createSourceFile(filePath, source, ts.ScriptTarget.ESNext, true, scriptKindFor(filePath));
	const nodeByStart = new Map<number, CfgNode>();
	for (const node of procedure.nodes) {
		if (node.location === undefined || node.kind === "entry" || node.kind === "exit") continue;
		const start = file.getPositionOfLineAndCharacter(node.location.start.line - 1, node.location.start.column - 1);
		nodeByStart.set(start, node);
	}

	const patches: Patch[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isStatement(node)) {
			const sourceStart = runtimeSourceStart(node, file);
			const graphNode = nodeByStart.get(sourceStart);
			if (graphNode !== undefined) {
				patches.push({ position: node.getStart(file), text: `__visualizerEmit(${JSON.stringify(graphNode.id)});\n` });
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(file);

	patches.sort((left, right) => right.position - left.position);
	let output = source;
	for (const patch of patches) output = `${output.slice(0, patch.position)}${patch.text}${output.slice(patch.position)}`;
	return output;
}

function runtimeSourceStart(statement: ts.Statement, file: ts.SourceFile): number {
	if (ts.isIfStatement(statement) || ts.isWhileStatement(statement) || ts.isDoStatement(statement)) {
		return statement.expression.getStart(file);
	}
	if (ts.isForStatement(statement)) return statement.condition?.getStart(file) ?? statement.getStart(file);
	if (ts.isForInStatement(statement) || ts.isForOfStatement(statement)) return statement.expression.getStart(file);
	if (ts.isSwitchStatement(statement)) return statement.expression.getStart(file);
	return statement.getStart(file);
}

function scriptKindFor(filePath: string): ts.ScriptKind {
	return filePath.toLowerCase().endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}
