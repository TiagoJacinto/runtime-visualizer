import type {
  AnalysisResponse,
  RevisionKey,
} from "@runtime-visualizer/contracts";
import { useMemo } from "react";

import type { FocusTarget } from "../../useCases/live-workspace.types";
import {
  buildSourceRangeIndex,
  diagnosticLines,
  nodeIdAtSourceLine,
  sourceRangeForNode,
} from "./source-range-index";

const EMPTY_DIAGNOSTICS: readonly AnalysisResponse["diagnostics"][number][] =
  [];
interface SourcePaneProps {
  source: string;
  cfg: NonNullable<AnalysisResponse["cfg"]> | null;
  scope: RevisionKey;
  focus: FocusTarget | null;
  importsVisible?: boolean;
  diagnostics?: readonly AnalysisResponse["diagnostics"][number][];
  onFocus: (target: FocusTarget | null) => void;
}
const sameScope = (a: RevisionKey | undefined, b: RevisionKey): boolean =>
  a?.file === b.file &&
  a?.procedureId === b.procedureId &&
  a?.revision === b.revision;
export const SourcePane = ({
  source,
  cfg,
  scope,
  focus,
  importsVisible = true,
  diagnostics = EMPTY_DIAGNOSTICS,
  onFocus,
}: SourcePaneProps) => {
  const index = useMemo(
    () => buildSourceRangeIndex(cfg, importsVisible),
    [cfg, importsVisible]
  );
  const lines = useMemo(() => source.split(/\r?\n/u), [source]);
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
            let borderClass = "border-transparent";
            if (focused) {
              borderClass = "border-emerald-300 bg-emerald-950/70";
            } else if (diagnostic) {
              borderClass = "border-rose-400 bg-rose-950/20";
            }
            return (
              <li
                key={lineNumber}
                data-testid="source-line"
                data-line-number={lineNumber}
                data-node-id={nodeId ?? undefined}
                data-focused={focused ? "true" : "false"}
                className={`flex min-w-max border-l-2 ${borderClass}`}
              >
                <span
                  aria-hidden="true"
                  className="w-12 shrink-0 px-3 text-right text-slate-600 select-none"
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
                        : { nodeId, origin: "source", scope }
                    )
                  }
                  className={`px-2 text-left whitespace-pre focus:ring-1 focus:ring-emerald-300 focus:outline-none focus:ring-inset ${executable ? "text-slate-200" : "cursor-default text-slate-500"}`}
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
};
