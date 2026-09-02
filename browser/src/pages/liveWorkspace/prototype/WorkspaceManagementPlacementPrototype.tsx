import { useEffect, useState } from "react";

type Choice =
  | "workspace-header"
  | "workspace-activity-rail"
  | "workspace-activity-switcher";

const runs = [
  {
    id: "run-01",
    name: "calculateTotal",
    meta: "checkout.ts · 42e91c · current scope",
    current: true,
  },
  { id: "run-08", name: "calculateTax", meta: "tax.ts · 1b640a" },
  { id: "run-11", name: "top-level", meta: "bootstrap.ts · 9f20c3" },
];

const labels: Record<Choice, string> = {
  "workspace-header": "Header management",
  "workspace-activity-rail": "Activity-rail popover",
  "workspace-activity-switcher": "Activity-rail switcher",
};

function readChoice(): Choice {
  const choice = new URLSearchParams(window.location.search).get("choice");
  return choice === "workspace-activity-rail" ||
    choice === "workspace-activity-switcher"
    ? choice
    : "workspace-header";
}

function RunList({ onClose }: { onClose: () => void }) {
  return (
    <section className="wmp-run-list" aria-label="Active workspace runs">
      <div className="wmp-list-title">Running now</div>
      {runs.map((run) => (
        <div className="wmp-run-row" key={run.id}>
          <div>
            <strong className="wmp-mono">
              {run.name} · {run.id}
            </strong>
            <small>{run.meta}</small>
          </div>
          <div className="wmp-actions">
            <button type="button" onClick={onClose}>
              View
            </button>
            <button type="button" className="wmp-danger" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

function WorkspaceManager({
  choice,
  onSelectRuns,
  onSelectScope,
}: {
  choice: Choice;
  onSelectRuns?: () => void;
  onSelectScope?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const isSwitcher = choice === "workspace-activity-switcher";
  const toggle = () => setOpen((value) => !value);
  if (choice === "workspace-header")
    return (
      <div className="wmp-header-manager">
        <button type="button" className="wmp-manager-button" onClick={toggle}>
          Active runs <b>3</b>
        </button>
        {open && <RunList onClose={() => setOpen(false)} />}
      </div>
    );
  return (
    <aside className="wmp-activity-rail" aria-label="Workspace activity">
      <button
        type="button"
        className="wmp-rail-button"
        title="Active runs"
        onClick={isSwitcher ? onSelectRuns : toggle}
      >
        ▶<b>3</b>
        <span>Runs</span>
      </button>
      <button
        type="button"
        className={`wmp-rail-button ${isSwitcher ? "" : "wmp-disabled"}`}
        title="Procedure scope"
        onClick={isSwitcher ? onSelectScope : undefined}
      >
        ◫<span>Scope</span>
      </button>
      {!isSwitcher && open && (
        <div className="wmp-rail-list">
          <RunList onClose={() => setOpen(false)} />
        </div>
      )}
    </aside>
  );
}

function ScopeRail({ showRuns }: { showRuns: boolean }) {
  if (showRuns)
    return (
      <nav className="wmp-scope-rail" aria-label="Active workspace runs">
        <div className="wmp-rail-label">
          Active runs <b className="wmp-nav-count">3</b>
        </div>
        {runs.map((run) => (
          <button type="button" className="wmp-nav-run" key={run.id}>
            <strong className="wmp-mono">{run.name}</strong>
            <small>
              {run.id} · {run.meta}
            </small>
          </button>
        ))}
      </nav>
    );
  return (
    <nav className="wmp-scope-rail" aria-label="Procedure scope">
      <div className="wmp-rail-label">Files</div>
      <button type="button" className="active">
        fixtures/checkout.ts
      </button>
      <button type="button">fixtures/tax.ts</button>
      <div className="wmp-rail-label wmp-rail-label-spaced">Procedures</div>
      <button type="button" className="active indent">
        calculateTotal
      </button>
      <button type="button" className="indent">
        top-level
      </button>
    </nav>
  );
}

export function WorkspaceManagementPlacementPrototype() {
  const [choice, setChoice] = useState<Choice>(readChoice);
  const [railView, setRailView] = useState<"scope" | "runs">("scope");
  const usesActivityRail = choice !== "workspace-header";
  useEffect(() => {
    const onPopState = () => setChoice(readChoice());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const select = (next: Choice) => {
    const url = new URL(window.location.href);
    url.searchParams.set("choice", next);
    window.history.pushState({}, "", url);
    setChoice(next);
    setRailView("scope");
  };
  return (
    <main
      className={`wmp-root ${usesActivityRail ? "wmp-activity-layout" : ""}`}
      data-testid="workspace-management-placement-prototype"
    >
      <style>{css}</style>
      <header className="wmp-topbar">
        <strong>Runtime Visualizer</strong>
        <div className="wmp-header-actions">
          <span>● Live workspace connected</span>
          {choice === "workspace-header" && (
            <WorkspaceManager choice={choice} />
          )}
        </div>
      </header>
      <div className="wmp-body">
        {usesActivityRail && (
          <WorkspaceManager
            choice={choice}
            onSelectRuns={() => setRailView("runs")}
            onSelectScope={() => setRailView("scope")}
          />
        )}
        <ScopeRail
          showRuns={
            choice === "workspace-activity-switcher" && railView === "runs"
          }
        />
        <section className="wmp-workspace">
          <div className="wmp-scope">
            <div>
              <h1>
                fixtures/checkout.ts <em>›</em> calculateTotal
              </h1>
              <div>
                <select
                  defaultValue="7bc114"
                  aria-label="Procedure analysis revision"
                >
                  <option>42e91c</option>
                  <option>51a0d7</option>
                  <option>7bc114</option>
                </select>
                <b className="wmp-newer">2</b>
              </div>
            </div>
            <button type="button" className="wmp-run">
              Run Procedure
            </button>
          </div>
          <div className="wmp-panes">
            <section className="wmp-panel">
              <div className="wmp-panel-head">
                <strong>Control-flow graph</strong>
                <span>
                  <button type="button">Imports off</button>
                  <button type="button">Fit graph</button>
                </span>
              </div>
              <div className="wmp-graph">
                <div className="node entry">Entry</div>
                <i />
                <div className="node">subtotal = items.reduce()</div>
                <i />
                <div className="node active">
                  subtotal &gt; 100?<b>1</b>
                </div>
                <div className="branch">
                  <div className="node">applyDiscount()</div>
                  <div className="node">
                    return subtotal<b className="sky">2</b>
                  </div>
                </div>
                <i />
                <div className="node entry">Exit</div>
              </div>
            </section>
            <section className="wmp-panel">
              <div className="wmp-panel-head">
                <strong>Source</strong>
                <button type="button">Hide code</button>
              </div>
              <pre>
                {" "}
                1 export function calculateTotal(items) {"{"}2 const subtotal =
                items.reduce(sum, 0) 3 if (subtotal &gt; 100) {"{"}4 return
                applyDiscount(subtotal) 5 {"}"}6 return subtotal 7 {"}"}
              </pre>
            </section>
          </div>
        </section>
      </div>
      <nav className="wmp-switcher" aria-label="Prototype candidate switcher">
        <span>Workspace management placement</span>
        {(
          [
            "workspace-header",
            "workspace-activity-rail",
            "workspace-activity-switcher",
          ] as Choice[]
        ).map((key) => (
          <button
            type="button"
            className={choice === key ? "selected" : ""}
            onClick={() => select(key)}
            key={key}
          >
            {labels[key]}
          </button>
        ))}
        <small>URL: ?prototype=workspace-management&amp;choice={choice}</small>
      </nav>
    </main>
  );
}

const css = `
.wmp-root{--ink:#07110e;--panel:#091510;--rail:#0a1712;--node:#0e1d18;--active:#122a21;--line:rgba(255,255,255,.1);--text:#e6f5ec;--muted:#8fa89b;--green:#6ee7b7;--amber:#fcd34d;--sky:#7dd3fc;--rose:#fda4af;min-height:100vh;background:var(--ink);color:var(--text);font:14px Inter,system-ui,sans-serif}.wmp-root *{box-sizing:border-box}.wmp-root button,.wmp-root select{cursor:pointer}.wmp-topbar{height:56px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);background:#08130f}.wmp-header-actions{display:flex;align-items:center;gap:14px;color:var(--green);font-size:12px}.wmp-header-manager{position:relative;color:var(--text)}.wmp-manager-button,.wmp-panel button,.wmp-run-row button{border:1px solid var(--line);border-radius:6px;background:#0c1a14;color:var(--text);padding:6px 8px;font-size:11px}.wmp-manager-button{font-weight:700}.wmp-manager-button b,.wmp-newer{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;margin-left:5px;border-radius:999px;background:var(--green);color:#062017;font-size:10px}.wmp-run-list{width:310px;padding:8px;border:1px solid var(--line);border-radius:10px;background:#0a1712;box-shadow:0 16px 40px rgba(0,0,0,.45)}.wmp-header-manager .wmp-run-list{position:absolute;z-index:10;right:0;top:38px}.wmp-list-title{padding:5px 6px 9px;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.wmp-run-row{display:grid;grid-template-columns:1fr auto;gap:9px;padding:10px 8px;border-top:1px solid var(--line)}.wmp-run-row small{display:block;margin-top:4px;color:var(--muted);font-size:10px}.wmp-mono,pre,select{font-family:"IBM Plex Mono",ui-monospace,monospace}.wmp-actions{display:flex;align-items:center;gap:4px}.wmp-actions button:first-child{color:var(--sky)}.wmp-actions .wmp-danger{color:var(--rose)}.wmp-body{display:grid;grid-template-columns:268px minmax(580px,1fr);min-height:calc(100vh - 56px)}.wmp-activity-layout .wmp-body{grid-template-columns:56px 268px minmax(580px,1fr)}.wmp-activity-layout .wmp-scope-rail{max-height:calc(100vh - 56px);overflow-y:auto}.wmp-scope-rail{background:var(--rail);border-right:1px solid var(--line);padding:18px 14px}.wmp-rail-label{display:block;margin:6px 8px 10px;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.wmp-rail-label-spaced{margin-top:24px}.wmp-scope-rail button{width:100%;border:0;border-radius:8px;background:transparent;color:#b9cfc2;padding:9px 10px;text-align:left}.wmp-scope-rail button.active{background:#143125;color:var(--green)}.wmp-scope-rail .indent{padding-left:21px}.wmp-nav-count{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;margin-left:5px;border-radius:999px;background:var(--green);color:#062017;font-size:10px}.wmp-scope-rail .wmp-nav-run{margin-bottom:4px;padding:10px;text-align:left}.wmp-nav-run strong,.wmp-nav-run small{display:block}.wmp-nav-run small{margin-top:4px;color:var(--muted);font-size:10px;line-height:1.4}.wmp-workspace{min-width:0;padding:20px}.wmp-scope{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.wmp-scope h1{margin:0 0 5px;font-size:17px}.wmp-scope em{color:var(--muted);font-style:normal}.wmp-scope select{border:1px solid var(--line);border-radius:5px;background:#0c1a14;color:#cce2d5;padding:5px 8px;font-size:11px}.wmp-newer{background:var(--amber);color:#241b02}.wmp-run{border:0;border-radius:7px;background:var(--green);color:#062017;padding:9px 13px;font-weight:800}.wmp-panes{display:grid;grid-template-columns:1.6fr 1fr;gap:12px;height:calc(100vh - 150px);min-height:540px}.wmp-panel{overflow:hidden;border:1px solid var(--line);border-radius:12px;background:var(--panel)}.wmp-panel-head{height:43px;padding:0 13px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);font-size:12px}.wmp-panel-head span{display:flex;gap:6px}.wmp-graph{display:flex;height:calc(100% - 43px);align-items:center;flex-direction:column;padding:20px;background:radial-gradient(circle at 40% 25%,#10271c,transparent 44%)}.node{position:relative;min-width:190px;padding:16px;border:1px solid #5a7d6e;border-radius:12px;background:var(--node);text-align:center;font-size:12px}.node.entry{min-width:130px}.node.active{border:2px solid var(--green);background:var(--active)}.node b{position:absolute;right:-10px;top:-10px;display:grid;place-items:center;width:29px;height:29px;border:3px solid var(--panel);border-radius:50%;background:var(--green);color:#062017}.node .sky{background:var(--sky)}.wmp-graph>i{height:25px;border-left:2px solid #456458}.branch{display:flex;gap:30px}.wmp-panel pre{margin:0;padding:16px;color:#bed5c8;font-size:12px;line-height:1.75}.wmp-activity-rail{position:relative;width:56px;padding:10px 7px;border-right:1px solid var(--line);background:#08130f}.wmp-rail-button{position:relative;display:grid;place-items:center;width:40px;margin-bottom:8px;border:0;border-radius:7px;background:transparent;color:var(--muted);font-size:17px}.wmp-rail-button span{margin-top:2px;font-size:9px}.wmp-rail-button b{position:absolute;right:-3px;top:-5px;display:grid;place-items:center;min-width:16px;height:16px;border-radius:50%;background:var(--green);color:#062017;font-size:9px}.wmp-rail-button:first-child{background:#143125;color:var(--green)}.wmp-disabled{opacity:.5}.wmp-rail-list{position:absolute;z-index:10;left:55px;top:10px}.wmp-switcher{position:fixed;z-index:20;bottom:14px;left:50%;display:flex;align-items:center;gap:6px;transform:translateX(-50%);padding:8px;border:1px solid rgba(110,231,183,.55);border-radius:10px;background:#06110c;box-shadow:0 12px 32px rgba(0,0,0,.45)}.wmp-switcher span{padding:0 5px;color:var(--muted);font-size:10px;font-weight:700}.wmp-switcher button{border:1px solid var(--line);border-radius:5px;background:#0c1a14;color:var(--text);padding:6px 8px;font-size:11px}.wmp-switcher button.selected{border-color:var(--green);background:#143125;color:var(--green)}.wmp-switcher small{color:var(--muted);font:9px "IBM Plex Mono",monospace}@media(max-width:860px){.wmp-body{display:block}.wmp-scope-rail{display:none}.wmp-activity-rail{position:absolute;height:calc(100vh - 56px)}.wmp-activity-rail+.wmp-scope-rail{display:none}.wmp-workspace{padding:12px}.wmp-panes{grid-template-columns:1fr;height:auto}.wmp-panel{min-height:360px}.wmp-switcher{max-width:95vw;flex-wrap:wrap;justify-content:center}}
`;
