import { Code2, Menu, Radio, RefreshCw } from "lucide-react";
import type { RevisionKey } from "@runtime-visualizer/contracts";
import type { LiveWorkspaceState } from "../../useCases/liveWorkspace.types";

type WorkspaceHeaderProps = {
  state: LiveWorkspaceState;
  scope: RevisionKey | null;
  onOpenRail: () => void;
};

export function WorkspaceHeader({
  state,
  scope,
  onOpenRail,
}: WorkspaceHeaderProps) {
  return (
    <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[#091510] px-3 sm:px-5">
      <button
        type="button"
        aria-label="Open workspace navigation"
        onClick={onOpenRail}
        className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-200 focus-visible:outline-offset-2 lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-emerald-300/20 bg-emerald-300/10">
          <Code2 className="h-4 w-4 text-emerald-300" />
        </span>
        <div className="hidden sm:block">
          <p className="text-xs font-semibold text-white">Runtime Visualizer</p>
          <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-600">
            Live procedure workspace
          </p>
        </div>
      </div>
      <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-lg border border-white/10 bg-[#07110E] px-3 py-1.5 md:flex">
        <span className="font-mono text-[10px] text-slate-300">
          {scope?.file ?? "No file selected"}
        </span>
        {scope ? <span className="text-slate-700">›</span> : null}
        <span className="font-mono text-[10px] text-emerald-300">
          {scope?.procedureId ?? "Workspace"}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span
          role="status"
          className={`hidden items-center gap-2 rounded-full border px-2.5 py-1.5 text-[10px] sm:inline-flex ${state.connection === "connected" ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : "border-amber-300/20 bg-amber-300/10 text-amber-200"}`}
        >
          {state.connection === "connected" ? (
            <Radio className="h-3 w-3" />
          ) : (
            <RefreshCw className="h-3 w-3 animate-spin" />
          )}
          {state.connection === "connected" ? "Connected" : "Reconnecting"}
        </span>
        <span className="sr-only">
          {state.connection === "connected" ? "Connected" : "Reconnecting"}
        </span>
      </div>
    </header>
  );
}
