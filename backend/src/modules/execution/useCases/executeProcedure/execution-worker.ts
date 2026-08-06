import vm from "node:vm";
import { parentPort, workerData } from "node:worker_threads";
import ts from "typescript";
import type { CfgNode, ProcedureCfg } from "../../../cfg/index.ts";

type ExecutionRequest = {
	readonly source: string;
	readonly filePath: string;
	readonly procedure: ProcedureCfg;
	readonly functionName?: string;
};

type WorkerMessage =
	| { readonly type: "node"; readonly nodeId: string }
	| {
			readonly type: "result";
			readonly status: "Succeeded" | "Failed";
			readonly error?: string;
	  };

type Patch = { readonly position: number; readonly text: string };
const EXECUTION_TIMEOUT_MS = 30_000;
const hostSetTimeout = globalThis.setTimeout.bind(globalThis);
const hostClearTimeout = globalThis.clearTimeout.bind(globalThis);

if (parentPort === null)
	throw new Error("Execution worker has no parent port.");
const port = parentPort;

const post = (message: WorkerMessage): void => port.postMessage(message);

try {
	const request = workerData as ExecutionRequest;
	const events: string[] = [];
	const instrumented = instrument(
		stripModuleMarker(request.source),
		request.filePath,
		request.procedure,
	);
	const javascript = ts.transpileModule(instrumented, {
		compilerOptions: {
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.None,
		},
		fileName: request.filePath,
	}).outputText;
	const timerApi = createSandboxTimerApi();
	const context = vm.createContext({
		__visualizerEmit: (nodeId: string) => {
			events.push(nodeId);
			post({ type: "node", nodeId });
		},
		setTimeout: timerApi.setTimeout,
		clearTimeout: timerApi.clearTimeout,
	});
	const invocation =
		request.functionName === undefined
			? ""
			: `\nawait ${request.functionName}();`;
	const script = new vm.Script(
		`(async () => {\n${javascript}${invocation}\n})()`,
		{ filename: request.filePath },
	);
	const result = script.runInContext(context, {
		timeout: EXECUTION_TIMEOUT_MS,
	});
	await waitForCompletion(result);
	post({ type: "result", status: "Succeeded" });
} catch (cause) {
	post({
		type: "result",
		status: "Failed",
		error: cause instanceof Error ? cause.message : String(cause),
	});
}

async function waitForCompletion(result: unknown): Promise<void> {
	if (!isPromiseLike(result)) return;
	let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
	try {
		await Promise.race([
			result,
			new Promise<never>((_resolve, reject) => {
				timeout = hostSetTimeout(
					() => reject(new Error("Execution timed out.")),
					EXECUTION_TIMEOUT_MS,
				);
			}),
		]);
	} finally {
		if (timeout !== undefined) hostClearTimeout(timeout);
	}
}

function createSandboxTimerApi(): {
	readonly setTimeout: (
		callback: (...args: unknown[]) => void,
		delay?: number,
		...args: unknown[]
	) => number;
	readonly clearTimeout: (id: number) => void;
} {
	let nextId = 0;
	const handles = new Map<number, ReturnType<typeof globalThis.setTimeout>>();
	return {
		setTimeout(callback, delay = 0, ...args) {
			const id = ++nextId;
			handles.set(
				id,
				hostSetTimeout(() => {
					handles.delete(id);
					callback(...args);
				}, delay),
			);
			return id;
		},
		clearTimeout(id) {
			const handle = handles.get(id);
			if (handle === undefined) return;
			handles.delete(id);
			hostClearTimeout(handle);
		},
	};
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		"then" in value &&
		typeof value.then === "function"
	);
}

function stripModuleMarker(source: string): string {
	return source.replace(/^\s*export\s*\{\s*\};?\s*$/gm, "");
}

function instrument(
	source: string,
	filePath: string,
	procedure: ProcedureCfg,
): string {
	const file = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.ESNext,
		true,
		scriptKindFor(filePath),
	);
	const nodeByStart = new Map<number, CfgNode>();
	for (const node of procedure.nodes) {
		if (
			node.location === undefined ||
			node.kind === "entry" ||
			node.kind === "exit"
		)
			continue;
		const start = file.getPositionOfLineAndCharacter(
			node.location.start.line - 1,
			node.location.start.column - 1,
		);
		nodeByStart.set(start, node);
	}

	const patches: Patch[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isStatement(node)) {
			const sourceStart = runtimeSourceStart(node, file);
			const graphNode = nodeByStart.get(sourceStart);
			if (graphNode !== undefined) {
				patches.push({
					position: node.getStart(file),
					text: `__visualizerEmit(${JSON.stringify(graphNode.id)});\n`,
				});
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(file);

	patches.sort((left, right) => right.position - left.position);
	let output = source;
	for (const patch of patches)
		output = `${output.slice(0, patch.position)}${patch.text}${output.slice(patch.position)}`;
	return output;
}

function runtimeSourceStart(
	statement: ts.Statement,
	file: ts.SourceFile,
): number {
	if (
		ts.isIfStatement(statement) ||
		ts.isWhileStatement(statement) ||
		ts.isDoStatement(statement)
	) {
		return statement.expression.getStart(file);
	}
	if (ts.isForStatement(statement))
		return statement.condition?.getStart(file) ?? statement.getStart(file);
	if (ts.isForInStatement(statement) || ts.isForOfStatement(statement))
		return statement.expression.getStart(file);
	if (ts.isSwitchStatement(statement))
		return statement.expression.getStart(file);
	return statement.getStart(file);
}

function scriptKindFor(filePath: string): ts.ScriptKind {
	return filePath.toLowerCase().endsWith(".tsx")
		? ts.ScriptKind.TSX
		: ts.ScriptKind.TS;
}
