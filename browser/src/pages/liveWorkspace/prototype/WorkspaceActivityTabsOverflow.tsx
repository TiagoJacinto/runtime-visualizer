import { useState, type ReactNode } from "react";

type RailView = "scope" | "runs";

type WorkspaceActivityTabsOverflowProps = {
  view: RailView;
  scopeContent: ReactNode;
  runContent: ReactNode;
  onSelectRuns: () => void;
  onSelectScope: () => void;
};

export function WorkspaceActivityTabsOverflow({
  view,
  scopeContent,
  runContent,
  onSelectRuns,
  onSelectScope,
}: WorkspaceActivityTabsOverflowProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <nav
      className="wmp-scope-rail wmp-overflow-rail"
      aria-label="Workspace navigation"
    >
      <div
        className="wmp-context-tabs"
        role="tablist"
        aria-label="Workspace sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === "scope"}
          className={view === "scope" ? "active" : ""}
          onClick={onSelectScope}
        >
          Scope
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "runs"}
          className={view === "runs" ? "active" : ""}
          onClick={onSelectRuns}
        >
          Runs
        </button>
        <button
          type="button"
          className={`wmp-more-tab ${moreOpen ? "active" : ""}`}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          More <b>3</b>
        </button>
      </div>
      {moreOpen && (
        <div
          className="wmp-context-overflow-menu"
          aria-label="More workspace sections"
        >
          <div className="wmp-overflow-kicker">Additional contexts</div>
          <button type="button" onClick={() => setMoreOpen(false)}>
            History
          </button>
          <button type="button" onClick={() => setMoreOpen(false)}>
            Alerts
          </button>
          <button type="button" onClick={() => setMoreOpen(false)}>
            Settings
          </button>
        </div>
      )}
      {view === "runs" ? runContent : scopeContent}
    </nav>
  );
}
