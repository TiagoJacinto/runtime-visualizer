import type { ChangeEvent, ReactNode } from "react";
import { ChevronDown, Play } from "lucide-react";
import type {
  AnalysisResponse,
  RevisionKey,
  RevisionSummary,
} from "@runtime-visualizer/contracts";
import type { LiveWorkspaceState } from "../../useCases/liveWorkspace.types";

type ScopeNavigationProps = {
  state: LiveWorkspaceState;
  analysis: AnalysisResponse | null;
  selectedScope: RevisionKey | null;
  revisions: readonly RevisionSummary[];
  revisionBadge: RevisionSummary | null;
  onSelectFile: (file: string) => void;
  onSelectProcedure: (procedureId: string) => void;
  onSelectRevision: (scope: RevisionKey) => void;
  onRun: () => void;
};

type SelectFieldProps = {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
  disabled?: boolean;
};

function SelectField({
  label,
  value,
  onChange,
  children,
  disabled,
}: SelectFieldProps) {
  return (
    <label className="block text-[9px] font-medium uppercase tracking-[0.16em] text-slate-500">
      {label}
      <div className="relative mt-1.5">
        <select
          aria-label={label}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="w-full appearance-none rounded-lg border border-white/10 bg-[#07110E] px-3 py-2.5 pr-8 text-xs text-slate-200 outline-none transition focus:border-emerald-300/50 focus:ring-2 focus:ring-emerald-300/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-3 h-3.5 w-3.5 text-slate-600"
        />
      </div>
    </label>
  );
}

export function ScopeNavigation({
  state,
  analysis,
  selectedScope,
  revisions,
  revisionBadge,
  onSelectFile,
  onSelectProcedure,
  onSelectRevision,
  onRun,
}: ScopeNavigationProps) {
  const runnable =
    analysis !== null &&
    analysis.cfg !== null &&
    analysis.diagnostics.length === 0 &&
    state.status === "ready";
  return (
    <div className="space-y-4 border-b border-white/10 p-4">
      <SelectField
        label="File"
        value={state.selectedFile ?? ""}
        onChange={(event) => onSelectFile(event.target.value)}
        disabled={
          state.files.length === 0 || state.connection === "reconnecting"
        }
      >
        <option value="" disabled>
          Select a file
        </option>
        {state.files.map((file) => (
          <option key={file} value={file}>
            {file}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Procedure"
        value={state.selectedProcedure ?? ""}
        onChange={(event) => onSelectProcedure(event.target.value)}
        disabled={analysis === null || state.connection === "reconnecting"}
      >
        {analysis?.procedures.map((procedure) => (
          <option key={procedure.id} value={procedure.id}>
            {procedure.label}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Revision"
        value={selectedScope?.revision ?? ""}
        onChange={(event) => {
          if (selectedScope !== null)
            onSelectRevision({
              ...selectedScope,
              revision: event.target.value,
            });
        }}
        disabled={revisions.length === 0 || state.connection === "reconnecting"}
      >
        {revisions.map((revision) => (
          <option key={revision.revision} value={revision.revision}>
            {revision.revision}
            {revision.runnable ? " · runnable" : " · diagnostics"}
          </option>
        ))}
      </SelectField>
      <div className="flex items-center justify-between gap-2 font-mono text-[9px] text-slate-600">
        <span className="truncate">
          {revisionBadge?.analyzedAt ?? "No revision loaded"}
        </span>
        <span className="shrink-0">
          {revisionBadge?.diagnosticCount ?? 0} diagnostics
        </span>
      </div>
      <button
        type="button"
        disabled={
          !runnable || state.connection === "reconnecting" || state.fileDeleted
        }
        onClick={onRun}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-300 py-2.5 text-xs font-semibold text-[#06100D] transition hover:bg-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-[#0A1712] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Play className="h-3.5 w-3.5 fill-current" />
        Run Procedure
      </button>
    </div>
  );
}
