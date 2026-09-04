import type { ExecutionRecord } from "../../useCases/liveWorkspace.types";

type RunInspectorProps = {
  executions: readonly ExecutionRecord[];
  selectedExecutionId: string | null;
  onSelect: (executionId: string) => void;
  onClearCompleted: () => void;
  onCancel?: (executionId: string) => void;
  armedExecutionId?: string | null;
  pendingCancelIds?: Readonly<Record<string, true>>;
};

function statusLabel(status: ExecutionRecord["status"]): string {
  return status[0].toUpperCase() + status.slice(1);
}

export function RunInspector({
  executions,
  selectedExecutionId,
  onSelect,
  onClearCompleted,
  onCancel,
  armedExecutionId = null,
  pendingCancelIds = {},
}: RunInspectorProps) {
  return (
    <aside
      aria-label="Run inspector"
      className="rounded border border-slate-800 bg-slate-900/70 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">Executions</h2>
        <button
          type="button"
          onClick={onClearCompleted}
          disabled={!executions.some((execution) => execution.status !== "running")}
        >
          Clear completed
        </button>
      </div>
      {executions.length === 0 ? (
        <p className="text-sm text-slate-400">No executions in this session.</p>
      ) : (
        <ul className="space-y-2">
          {executions.map((execution, index) => {
            const pending = pendingCancelIds[execution.executionId] === true;
            const armed = armedExecutionId === execution.executionId;
            return (
              <li key={execution.executionId} className="rounded border border-slate-700">
                <div className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => onSelect(execution.executionId)}
                    aria-current={
                      selectedExecutionId === execution.executionId
                        ? "true"
                        : undefined
                    }
                    className="min-w-0 flex-1 p-3 text-left"
                  >
                    <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-xs font-bold text-slate-950">
                      {execution.displayNumber ?? index + 1}
                    </span>
                    <strong>{statusLabel(execution.status)}</strong>
                    <span className="ml-2 font-mono text-xs text-slate-400">
                      {execution.executionId.slice(0, 8)}
                    </span>
                    {execution.error ? (
                      <span className="mt-1 block text-xs text-rose-300">
                        {execution.error}
                      </span>
                    ) : null}
                  </button>
                  {execution.status === "running" && onCancel ? (
                    <button
                      type="button"
                      aria-label={
                        armed ? "Confirm cancel execution" : "Cancel execution"
                      }
                      disabled={pending}
                      onClick={() => onCancel(execution.executionId)}
                      className="border-l border-slate-700 px-3 text-xs text-amber-300 disabled:opacity-50"
                    >
                      {pending ? "Cancelling…" : armed ? "Confirm" : "Cancel"}
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
