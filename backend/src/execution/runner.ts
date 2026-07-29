import { Worker } from "node:worker_threads";
import type { ProcedureCfg } from "../cfg/types.ts";

export type ExecutionResult = {
	readonly status: "Succeeded" | "Failed";
	readonly events: ReadonlyArray<string>;
	readonly error?: string;
};

export type ExecutionObserver = (nodeId: string) => void;
const EXECUTION_TIMEOUT_MS = 30_000;

type WorkerMessage =
	| { readonly type: "node"; readonly nodeId: string }
	| {
			readonly type: "result";
			readonly status: "Succeeded" | "Failed";
			readonly error?: string;
	  };

/** Execute a selected file Procedure in an isolated worker and report nodes reached at runtime. */
export async function executeProcedure(
	source: string,
	filePath: string,
	procedure: ProcedureCfg,
	functionName: string | undefined,
	onEvent?: ExecutionObserver,
): Promise<ExecutionResult> {
	const events: string[] = [];
	const worker = new Worker(new URL("./execution-worker.ts", import.meta.url), {
		workerData: { source, filePath, procedure, functionName },
		resourceLimits: {
			maxOldGenerationSizeMb: 64,
			maxYoungGenerationSizeMb: 16,
			codeRangeSizeMb: 4,
			stackSizeMb: 4,
		},
	});

	return new Promise<ExecutionResult>((resolve) => {
		let settled = false;
		const timeout = setTimeout(
			() => finish({ status: "Failed", events, error: "Execution timed out." }),
			EXECUTION_TIMEOUT_MS,
		);
		const finish = (result: ExecutionResult): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			void worker.terminate();
			resolve(result);
		};

		worker.on("message", (message: WorkerMessage) => {
			if (message.type === "node") {
				events.push(message.nodeId);
				onEvent?.(message.nodeId);
				return;
			}
			finish({
				status: message.status,
				events,
				...(message.error === undefined ? {} : { error: message.error }),
			});
		});
		worker.on("error", (cause) =>
			finish({ status: "Failed", events, error: cause.message }),
		);
		worker.on("exit", (code) => {
			if (!settled)
				finish({
					status: "Failed",
					events,
					error: `Execution worker exited with code ${code} before returning a result.`,
				});
		});
	});
}
