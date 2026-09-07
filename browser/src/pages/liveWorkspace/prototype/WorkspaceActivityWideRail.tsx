import type { ReactNode } from "react";

type RailView = "scope" | "runs";

type WorkspaceActivityWideRailProps = {
  view: RailView;
  scopeContent: ReactNode;
  runContent: ReactNode;
};

export function WorkspaceActivityWideRail({
  view,
  scopeContent,
  runContent,
}: WorkspaceActivityWideRailProps) {
  return (
    <nav
      className="wmp-scope-rail wmp-wide-rail"
      aria-label={view === "runs" ? "Active workspace runs" : "Procedure scope"}
    >
      <div className="wmp-wide-rail-heading">
        <span>{view === "runs" ? "Active runs" : "Procedure scope"}</span>
        <b>{view === "runs" ? "30" : ""}</b>
      </div>
      {view === "runs" ? runContent : scopeContent}
    </nav>
  );
}
