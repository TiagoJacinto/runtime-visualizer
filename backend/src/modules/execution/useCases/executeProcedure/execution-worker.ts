import vm from "node:vm";
// Worker bootstrap intentionally calls helpers declared below; module evaluation is synchronous.
// oxlint-disable eslint/no-use-before-define
import { parentPort, workerData } from "node:worker_threads";

import ts from "typescript";

import type { CfgNode, ProcedureCfg } from "../../../cfg/index.ts";

interface ExecutionRequest {
  readonly source: string;
  readonly filePath: string;
  readonly procedure: ProcedureCfg;
  readonly functionName?: string;
}
type WorkerMessage =
  | {
      readonly type: "node";
      readonly nodeId: string;
    }
  | {
      readonly type: "result";
      readonly status: "Succeeded" | "Failed";
      readonly error?: string;
    };
interface Patch {
  readonly position: number;
  readonly text: string;
}
interface SandboxTimerApi {
  readonly setTimeout: (
    callback: (...args: unknown[]) => void,
    delay?: number,
    ...args: unknown[]
  ) => number;
  readonly clearTimeout: (id: number) => void;
}
const EXECUTION_TIMEOUT_MS = 30_000;
const hostSetTimeout = globalThis.setTimeout.bind(globalThis);
const hostClearTimeout = globalThis.clearTimeout.bind(globalThis);
if (parentPort === null) {
  throw new Error("Execution worker has no parent port.");
}
const port = parentPort;
const post = (message: WorkerMessage): void => port.postMessage(message);
// SAFETY: vm.Script returns an unknown runtime value; this guard narrows thenable values.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
const waitForCompletion = async (result: unknown): Promise<void> => {
  if (!isPromiseLike(result)) {
    return;
  }
  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timeoutDeferred = Promise.withResolvers<never>();
  try {
    timeout = hostSetTimeout(
      () => timeoutDeferred.reject(new Error("Execution timed out.")),
      EXECUTION_TIMEOUT_MS
    );
    await Promise.race([result, timeoutDeferred.promise]);
  } finally {
    if (timeout !== undefined) {
      hostClearTimeout(timeout);
    }
  }
};
const createSandboxTimerApi = (): SandboxTimerApi => {
  let nextId = 0;
  const handles = new Map<number, ReturnType<typeof globalThis.setTimeout>>();
  return {
    clearTimeout(id) {
      const handle = handles.get(id);
      if (handle === undefined) {
        return;
      }
      handles.delete(id);
      hostClearTimeout(handle);
    },
    setTimeout(callback, delay = 0, ...args) {
      nextId += 1;
      const id = nextId;
      handles.set(
        id,
        hostSetTimeout(() => {
          handles.delete(id);
          // SAFETY: sandbox timers intentionally invoke the caller's callback.
          // oxlint-disable-next-line promise/prefer-await-to-callbacks
          callback(...args);
        }, delay)
      );
      return id;
    },
  };
};
const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === "object" &&
  value !== null &&
  "then" in value &&
  typeof value.then === "function";
const stripModuleSyntax = (source: string): string =>
  source
    .replaceAll(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gmu, "")
    .replaceAll(/^\s*export\s+\*\s+from\s+["'][^"']+["']\s*;?\s*$/gmu, "")
    .replaceAll(
      /\bexport\s+(?=(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function|class|const|let|var|type|interface|namespace|enum)\b)/gu,
      ""
    )
    .replaceAll(/\bexport\s+default\s+/gu, "");
const instrument = (
  source: string,
  filePath: string,
  procedure: ProcedureCfg
): string => {
  const file = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.ESNext,
    true,
    scriptKindFor(filePath)
  );
  const nodeByStart = new Map<number, CfgNode>();
  for (const node of procedure.nodes) {
    if (
      node.location === undefined ||
      node.kind === "entry" ||
      node.kind === "exit"
    ) {
      continue;
    }
    const start = file.getPositionOfLineAndCharacter(
      node.location.start.line - 1,
      node.location.start.column - 1
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
  for (const patch of patches) {
    output = `${output.slice(0, patch.position)}${patch.text}${output.slice(patch.position)}`;
  }
  return output;
};
const runtimeSourceStart = (
  statement: ts.Statement,
  file: ts.SourceFile
): number => {
  if (
    ts.isIfStatement(statement) ||
    ts.isWhileStatement(statement) ||
    ts.isDoStatement(statement)
  ) {
    return statement.expression.getStart(file);
  }
  if (ts.isForStatement(statement)) {
    return statement.condition?.getStart(file) ?? statement.getStart(file);
  }
  if (ts.isForInStatement(statement) || ts.isForOfStatement(statement)) {
    return statement.expression.getStart(file);
  }
  if (ts.isSwitchStatement(statement)) {
    return statement.expression.getStart(file);
  }
  return statement.getStart(file);
};
const scriptKindFor = (filePath: string): ts.ScriptKind =>
  filePath.toLowerCase().endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;

try {
  // SAFETY: workerData is created by executeProcedure with this exact request shape.
  const request = workerData as ExecutionRequest;
  const events: string[] = [];
  const instrumented = instrument(
    stripModuleSyntax(request.source),
    request.filePath,
    request.procedure
  );
  const javascript = ts.transpileModule(instrumented, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: request.filePath,
  }).outputText;
  const timerApi = createSandboxTimerApi();
  const context = vm.createContext({
    __visualizerEmit: (nodeId: string) => {
      events.push(nodeId);
      post({ nodeId, type: "node" });
    },
    clearTimeout: timerApi.clearTimeout,
    setTimeout: timerApi.setTimeout,
  });
  const invocation =
    request.functionName === undefined
      ? ""
      : `\nawait ${request.functionName}();`;
  const script = new vm.Script(
    `(async () => {\n${javascript}${invocation}\n})()`,
    { filename: request.filePath }
  );
  const result = script.runInContext(context, {
    timeout: EXECUTION_TIMEOUT_MS,
  });
  await waitForCompletion(result);
  post({ status: "Succeeded", type: "result" });
} catch (error) {
  post({
    error: error instanceof Error ? error.message : String(error),
    status: "Failed",
    type: "result",
  });
}
