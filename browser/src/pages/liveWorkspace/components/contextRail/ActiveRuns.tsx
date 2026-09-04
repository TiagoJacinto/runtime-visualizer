import { AlertCircle, Check, Eye, RefreshCw, X } from "lucide-react";
import type { ExecutionRecord } from "../../useCases/liveWorkspace.types";

type ActiveRunsProps = {
  executions: readonly ExecutionRecord[];
  selectedExecutionId: string | null;
  onSelect: (executionId: string) => void;
  onClearCompleted: () => void;
  onCancel: (executionId: string) => void;
  armedExecutionId: string | null;
  pendingCancelIds: Readonly<Record<string, true>>;
};

function StatusIcon({ status }: { status: ExecutionRecord["status"] }) {
  if (status === "running")
    return <RefreshCw className="h-3.5 w-3.5 animate-spin" />;
  if (status === "failed" || status === "interrupted")
    return <AlertCircle className="h-3.5 w-3.5" />;
  return <Check className="h-3.5 w-3.5" />;
}

function statusLabel(status: ExecutionRecord["status"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusColor(status: ExecutionRecord["status"]): string {
  if (status === "running") return "text-sky-300";
  if (status === "failed" || status === "interrupted") return "text-rose-300";
  return "text-emerald-300";
}

export function ActiveRuns({
  executions,
  selectedExecutionId,
  onSelect,
  onClearCompleted,
  onCancel,
  armedExecutionId,
  pendingCancelIds,
}: ActiveRunsProps) {
  const activeCount = executions.filter(
    (execution) => execution.status === "running",
  ).length;
  return (
    <aside
      aria-label="Run inspector"
      className="flex min-h-0 flex-1 flex-col p-3"
    >
      <div className="flex items-center justify-between px-2 py-2">
        <span className="flex items-center gap-2 text-xs font-medium text-slate-300">
          Runs <span className="text-slate-600">{activeCount} active</span>
        </span>
        <button
          type="button"
          aria-label="Clear completed runs"
          onClick={onClearCompleted}
          disabled={!executions.some((execution) => execution.status !== "running")}
          className="text-[10px] text-slate-500 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear
        </button>
      </div>
      {executions.length === 0 ? (
        <p className="px-2 py-4 text-xs text-slate-500">No executions yet.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {executions.map((execution, index) => {
            const pending = pendingCancelIds[execution.executionId] === true;
            const armed = armedExecutionId === execution.executionId;
            const number = execution.displayNumber ?? index + 1;
            return (
              <li
                key={execution.executionId}
                className={`rounded-lg border p-2.5 transition ${selectedExecutionId === execution.executionId ? "border-white/15 bg-white/[0.065]" : "border-transparent hover:bg-white/[0.03]"}`}
              >
                <div className="flex items-start gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-400 font-mono text-[9px] font-bold text-[#07110E]">
                    {number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-slate-200">
                      {execution.procedure ?? "Top level"}
                    </p>
                    <p className="truncate font-mono text-[9px] text-slate-600">
                      {execution.file} · {execution.revision}
                    </p>
                  </div>
                  <span className={`flex shrink-0 items-center gap-1 text-[9px] ${statusColor(execution.status)}`}>
                    <StatusIcon status={execution.status} />
                    {statusLabel(execution.status)}
                  </span>
                </div>
                {execution.currentNodeId ? (
                  <p className="mt-2 truncate pl-7 font-mono text-[9px] text-slate-500">
                    {execution.currentNodeId}
                  </p>
                ) : null}
                {execution.error ? (
                  <p className="mt-1 truncate pl-7 text-[9px] text-rose-300">
                    {execution.error}
                  </p>
                ) : null}
                <div className="mt-2 flex justify-end gap-1 pl-7">
                  <button
                    type="button"
                    aria-label={`View execution ${number}`}
                    onClick={() => onSelect(execution.executionId)}
                    className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[9px] text-slate-400 hover:border-emerald-300/40 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-200"
                  >
                    <Eye className="h-3 w-3" />
                    View
                  </button>
                  {execution.status === "running" ? (
                    <button
                      type="button"
                      aria-label={
                        armed
                          ? `Confirm cancel execution ${number}`
                          : `Cancel execution ${number}`
                      }
                      disabled={pending}
                      onClick={() => onCancel(execution.executionId)}
                      className="inline-flex items-center gap-1 rounded border border-amber-300/20 px-2 py-1 text-[9px] text-amber-200 hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-amber-200"
                    >
                      <X className="h-3 w-3" />
                      {pending ? "Cancelling…" : armed ? "Confirm cancel" : "Cancel"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
