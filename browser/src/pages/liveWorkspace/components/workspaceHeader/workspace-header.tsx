import type { RevisionKey } from "@runtime-visualizer/contracts";
import { Code2, Menu, Radio, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import type { LiveWorkspaceView } from "../../useCases/live-workspace.types";

interface WorkspaceHeaderProps {
  state: LiveWorkspaceView;
  scope: RevisionKey | null;
  onOpenRail: () => void;
  localMode?: boolean;
}

export const WorkspaceHeader = ({
  state,
  scope,
  onOpenRail,
  localMode = false,
}: WorkspaceHeaderProps) => {
  const connected = state.connection === "connected";
  let statusText = "Reconnecting";
  let statusDescription = "Reconnecting";
  let statusClass = "border-amber-300/20 bg-amber-300/10 text-amber-200";
  let statusIcon: ReactNode = <RefreshCw className="h-3 w-3 animate-spin" />;

  if (localMode) {
    statusText = "Local project";
    statusDescription = "Local project open";
    statusClass = "border-emerald-300/20 bg-emerald-300/10 text-emerald-200";
    statusIcon = null;
  } else if (connected) {
    statusText = "Connected";
    statusDescription = "Connected";
    statusClass = "border-emerald-300/20 bg-emerald-300/10 text-emerald-200";
    statusIcon = <Radio className="h-3 w-3" />;
  }

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[#091510] px-3 sm:px-5">
      <button
        type="button"
        aria-label="Open workspace navigation"
        onClick={onOpenRail}
        className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200 lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-emerald-300/20 bg-emerald-300/10">
          <Code2 className="h-4 w-4 text-emerald-300" />
        </span>
        <div className="hidden sm:block">
          <p className="text-xs font-semibold text-white">Runtime Visualizer</p>
          <p className="font-mono text-[8px] tracking-[0.16em] text-slate-600 uppercase">
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
        <output
          className={`hidden items-center gap-2 rounded-full border px-2.5 py-1.5 text-[10px] sm:inline-flex ${statusClass}`}
        >
          {statusIcon}
          {statusText}
        </output>
        <span className="sr-only">{statusDescription}</span>
      </div>
    </header>
  );
};
