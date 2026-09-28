/* oxlint-disable require-post-message-target-origin */
import ts from "typescript";

import type {
  ExecutionWorkerReply,
  ExecutionWorkerRequest,
} from "./index.ts";

interface WorkerScope {
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<ExecutionWorkerRequest>) => void
  ) => void;
  postMessage: (message: ExecutionWorkerReply) => void;
}
interface Patch {
  readonly position: number;
  readonly text: string;
}
interface SandboxTimerApi {
  readonly clearTimeout: (id: number) => void;
  readonly setTimeout: (
    callback: (...args: unknown[]) => void,
    delay?: number,
    ...args: unknown[]
  ) => number;
}

// SAFETY: Vite loads this file only as a dedicated module worker.
const scope = globalThis as WorkerScope;
const hostSetTimeout = globalThis.setTimeout.bind(globalThis);
const hostClearTimeout = globalThis.clearTimeout.bind(globalThis);

const stripModuleSyntax = (source: string): string =>
  source
    .replaceAll(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gmu, "")
    .replaceAll(/^\s*export\s+\*\s+from\s+["'][^"']+["']\s*;?\s*$/gmu, "")
    .replaceAll(
      /\bexport\s+(?=(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function|class|const|let|var|type|interface|namespace|enum)\b)/gu,
      ""
    )
    .replaceAll(/\bexport\s+default\s+/gu, "");

const scriptKindFor = (filePath: string): ts.ScriptKind =>
  filePath.toLowerCase().endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;

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

const instrument = (
  source: string,
  filePath: string,
  procedure: ExecutionWorkerRequest["procedure"]
): string => {
  const file = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.ESNext,
    true,
    scriptKindFor(filePath)
  );
  const nodeByStart = new Map<number, string>();
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
    nodeByStart.set(start, node.id);
  }
  const patches: Patch[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStatement(node)) {
      const graphNode = nodeByStart.get(runtimeSourceStart(node, file));
      if (graphNode !== undefined) {
        patches.push({
          position: node.getStart(file),
          text: `__visualizerEmit(${JSON.stringify(graphNode)});\n`,
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
          // SAFETY: instrumented project code intentionally schedules this callback.
          // oxlint-disable-next-line promise/prefer-await-to-callbacks
          callback(...args);
        }, delay)
      );
      return id;
    },
  };
};

const run = async (request: ExecutionWorkerRequest): Promise<void> => {
  const instrumented = stripModuleSyntax(
    instrument(request.source, request.filePath, request.procedure)
  );
  const javascript = ts.transpileModule(instrumented, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: request.filePath,
  }).outputText;
  const timerApi = createSandboxTimerApi();
  const invocation =
    request.functionName === undefined
      ? ""
      : `\nawait ${request.functionName}();`;
  // SAFETY: the generated wrapper supplies the three declared parameters and returns a Promise.
  // oxlint-disable-next-line no-new-func
  const invoke = new Function(
    "__visualizerEmit",
    "setTimeout",
    "clearTimeout",
    `return (async () => {\n${javascript}${invocation}\n})()`
  ) as (
    emit: (nodeId: string) => void,
    setTimeout: SandboxTimerApi["setTimeout"],
    clearTimeout: SandboxTimerApi["clearTimeout"]
  ) => Promise<void>;
  await invoke(
    (nodeId) => scope.postMessage({ nodeId, type: "node" }),
    timerApi.setTimeout,
    timerApi.clearTimeout
  );
};

scope.addEventListener("message", async (event) => {
  try {
    await run(event.data);
    scope.postMessage({ status: "Succeeded", type: "result" });
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : String(error),
      status: "Failed",
      type: "result",
    });
  }
});
