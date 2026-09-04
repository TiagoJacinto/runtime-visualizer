import { useMemo } from "react";
import type {
  AnalysisResponse,
  RevisionKey,
} from "@runtime-visualizer/contracts";
import type { FocusTarget } from "../../useCases/liveWorkspace.types";
import {
  buildSourceRangeIndex,
  diagnosticLines,
  nodeIdAtSourceLine,
  sourceRangeForNode,
} from "./sourceRangeIndex";

type SourcePaneProps = {
  source: string;
  cfg: NonNullable<AnalysisResponse["cfg"]> | null;
  scope: RevisionKey;
  focus: FocusTarget | null;
  importsVisible?: boolean;
  diagnostics?: readonly AnalysisResponse["diagnostics"][number][];
  onFocus: (target: FocusTarget | null) => void;
};

function sameScope(a: RevisionKey | undefined, b: RevisionKey): boolean {
  return (
    a?.file === b.file &&
    a?.procedureId === b.procedureId &&
    a?.revision === b.revision
  );
}

export function SourcePane({
  source,
  cfg,
  scope,
  focus,
  importsVisible = true,
  diagnostics = [],
  onFocus,
}: SourcePaneProps) {
  const index = useMemo(
    () => buildSourceRangeIndex(cfg, importsVisible),
    [cfg, importsVisible],
  );
  const lines = useMemo(() => source.split(/\r?\n/), [source]);
  const errorLines = useMemo(() => diagnosticLines(diagnostics), [diagnostics]);
  const focusedRange =
    focus !== null && sameScope(focus.scope, scope)
      ? sourceRangeForNode(index, focus.nodeId)
      : null;

  return (
    <section
      aria-label="Source"
      data-testid="source-pane"
      className="overflow-hidden rounded border border-slate-800 bg-slate-950"
    >
      <div className="border-b border-slate-800 px-4 py-3">
        <h3 className="font-medium text-slate-100">Source</h3>
        <p className="text-xs text-slate-500">
          Select an executable line to focus its graph node.
        </p>
      </div>
      <div className="max-h-[28rem] overflow-auto p-2">
        <ol className="m-0 list-none p-0 font-mono text-xs leading-6">
          {lines.map((line, indexInSource) => {
            const lineNumber = indexInSource + 1;
            const nodeId = nodeIdAtSourceLine(index, lineNumber);
            const executable = nodeId !== null;
            const focused =
              focusedRange !== null &&
              lineNumber >= focusedRange.startLine &&
              lineNumber <= focusedRange.endLine;
            const diagnostic = errorLines.has(lineNumber);
            return (
              <li
                key={lineNumber}
                data-testid="source-line"
                data-line-number={lineNumber}
                data-node-id={nodeId ?? undefined}
                data-focused={focused ? "true" : "false"}
                className={`flex min-w-max border-l-2 ${focused ? "border-emerald-300 bg-emerald-950/70" : diagnostic ? "border-rose-400 bg-rose-950/20" : "border-transparent"}`}
              >
                <span
                  aria-hidden="true"
                  className="w-12 shrink-0 select-none px-3 text-right text-slate-600"
                >
                  {lineNumber}
                </span>
                <button
                  type="button"
                  aria-label={`Source line ${lineNumber}${executable ? ", executable" : ", not executable"}`}
                  aria-disabled={!executable}
                  onClick={() =>
                    onFocus(
                      nodeId === null
                        ? null
                        : { scope, nodeId, origin: "source" },
                    )
                  }
                  className={`whitespace-pre px-2 text-left focus:outline-none focus:ring-1 focus:ring-inset focus:ring-emerald-300 ${executable ? "text-slate-200" : "cursor-default text-slate-500"}`}
                >
                  {line || " "}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
