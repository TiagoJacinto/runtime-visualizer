import { AlertCircle, GitBranch, RefreshCw } from "lucide-react";
import type { WorkspaceController } from "../../useCases/liveWorkspace.ports";
import type { LiveWorkspaceState } from "../../useCases/liveWorkspace.types";

type WorkspaceNotificationsProps = {
  state: LiveWorkspaceState;
  controller: WorkspaceController;
};

export function WorkspaceNotifications({
  state,
  controller,
}: WorkspaceNotificationsProps) {
  const runningExecutions = state.executions.filter(
    (execution) => execution.status === "running",
  );
  const hasRunningNotice = runningExecutions.length > 0;
  const hasConnectionNotice = state.connection === "reconnecting";
  const hasQueueNotice = state.queuedRevision !== null;
  const hasDeleteNotice = state.fileDeleted;
  const hasErrorNotice =
    state.errorMessage !== null && state.pane.status !== "failed";
  if (
    !hasRunningNotice &&
    !hasConnectionNotice &&
    !hasQueueNotice &&
    !hasDeleteNotice &&
    !hasErrorNotice &&
    state.notifications.length === 0
  )
    return null;

  return (
    <section
      aria-label="Workspace notifications"
      aria-live="polite"
      className="space-y-2 px-4 pt-4 sm:px-6"
    >
      {runningExecutions.map((execution) => (
        <div
          key={`running-${execution.executionId}`}
          role="status"
          className="flex items-center gap-3 rounded-lg border border-sky-300/15 bg-sky-300/[0.05] px-3 py-2 text-[10px] text-sky-100"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
          <span>
            <strong>Running</strong> {execution.procedure ?? "Top level"} ·{" "}
            {execution.file}
          </span>
        </div>
      ))}
      {hasConnectionNotice ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-[10px] text-amber-100"
        >
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-300" />
          Reconnecting to the workspace event stream…
          <button
            type="button"
            onClick={controller.retry}
            className="ml-auto rounded border border-amber-300/20 px-2 py-1 text-amber-200 hover:bg-amber-300/10"
          >
            Retry
          </button>
        </div>
      ) : null}
      {hasQueueNotice ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-[10px] text-amber-100"
        >
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          <span>
            <strong>Update queued</strong>. The displayed revision stays pinned
            until active executions finish.
          </span>
        </div>
      ) : null}
      {hasDeleteNotice ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-rose-300/20 bg-rose-300/[0.05] px-3 py-2 text-[10px] text-rose-100"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-300" />
          The selected file was deleted while an execution was active.
        </div>
      ) : null}
      {hasErrorNotice ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-rose-300/20 bg-rose-300/[0.05] px-3 py-2 text-[10px] text-rose-100"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-300" />
          {state.errorMessage}
        </div>
      ) : null}
      {state.notifications.map((notification) => (
        <div
          key={notification.id}
          role={notification.level === "error" ? "alert" : "status"}
          className={`rounded-lg border px-3 py-2 text-[10px] ${notification.level === "error" ? "border-rose-300/20 bg-rose-300/[0.05] text-rose-100" : "border-emerald-300/15 bg-emerald-300/[0.05] text-emerald-100"}`}
        >
          {notification.message}
        </div>
      ))}
    </section>
  );
}
