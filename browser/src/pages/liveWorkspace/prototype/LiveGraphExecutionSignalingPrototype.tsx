import { useState } from "react";

/**
 * PROTOTYPE ONLY — issue #48. Development host: ?prototype=execution-signaling.
 *
 * UI contract: compare active-run node markers (A) with one live graph signal
 * plus an inspector trace (B). Both use the same source, Procedure scope, directed
 * control-flow diagram, inspector data, dark design system, and viewport.
 */
type CandidateKey = "A" | "B";
type StateKey =
  | "branch"
  | "loop"
  | "slow"
  | "success"
  | "failure"
  | "diagnostic";
type NodeId =
  | "entry"
  | "validate"
  | "decision"
  | "approve"
  | "fetch"
  | "retry"
  | "exit";
type EdgeId =
  | "entry-validate"
  | "validate-decision"
  | "decision-approve"
  | "decision-fetch"
  | "fetch-retry"
  | "retry-validate"
  | "approve-exit";

type RunColor = "sky" | "violet" | "amber";
type PrototypeRun = {
  id: string;
  node: NodeId;
  color: RunColor;
};

const runColors: Record<RunColor, { fill: string; className: string }> = {
  sky: { fill: "#38bdf8", className: "bg-sky-400" },
  violet: { fill: "#c4b5fd", className: "bg-violet-300" },
  amber: { fill: "#fbbf24", className: "bg-amber-400" },
};

type PrototypeState = {
  label: string;
  detail: string;
  current: NodeId | null;
  activeRuns: PrototypeRun[];
  visited: NodeId[];
  pulse: EdgeId | null;
  outcome: string;
  terminal?: "Succeeded" | "Failed";
};

const states: Record<StateKey, PrototypeState> = {
  branch: {
    label: "Branch selection",
    detail: "The true outcome is chosen; the false route stays visible.",
    current: "approve",
    activeRuns: [
      { id: "run-04", node: "approve", color: "sky" },
      { id: "run-07", node: "fetch", color: "amber" },
    ],
    visited: ["entry", "validate", "decision", "approve"],
    pulse: "decision-approve",
    outcome: "true",
  },
  loop: {
    label: "Repeated loop visit",
    detail:
      "Validate request has been visited three times without making the graph ambiguous.",
    current: "validate",
    activeRuns: [
      { id: "run-02", node: "validate", color: "sky" },
      { id: "run-05", node: "validate", color: "violet" },
      { id: "run-07", node: "fetch", color: "amber" },
    ],
    visited: [
      "entry",
      "validate",
      "decision",
      "fetch",
      "retry",
      "validate",
      "decision",
      "fetch",
      "retry",
      "validate",
    ],
    pulse: "retry-validate",
    outcome: "retry #3",
  },
  slow: {
    label: "Slow node",
    detail: "The active statement has exceeded its 800 ms expected duration.",
    current: "fetch",
    activeRuns: [{ id: "run-07", node: "fetch", color: "amber" }],
    visited: ["entry", "validate", "decision", "fetch"],
    pulse: "decision-fetch",
    outcome: "1.8 s elapsed",
  },
  success: {
    label: "Successful completion",
    detail:
      "Terminal result is retained in the inspector; no graph path remains live.",
    current: null,
    activeRuns: [],
    visited: ["entry", "validate", "decision", "approve", "exit"],
    pulse: null,
    outcome: "return approved",
    terminal: "Succeeded",
  },
  failure: {
    label: "Terminal failure",
    detail:
      "The error and terminal source range remain inspectable after the graph signal clears.",
    current: null,
    activeRuns: [],
    visited: ["entry", "validate", "decision", "fetch"],
    pulse: null,
    outcome: "NetworkError: policy service unavailable",
    terminal: "Failed",
  },
  diagnostic: {
    label: "Graph-blocking diagnostic",
    detail:
      "A With statement prevents graph generation; source and Procedure scope remain available.",
    current: null,
    activeRuns: [],
    visited: [],
    pulse: null,
    outcome: "Unsupported With statement",
  },
};

const nodes: Record<
  NodeId,
  { label: string; range: string; x: number; y: number; kind?: "decision" }
> = {
  entry: { label: "Entry", range: "1:1", x: 380, y: 46 },
  validate: { label: "Validate request", range: "2:3", x: 380, y: 142 },
  decision: {
    label: "Eligible?",
    range: "4:7",
    x: 380,
    y: 252,
    kind: "decision",
  },
  approve: { label: "Approve", range: "5:5", x: 195, y: 370 },
  fetch: { label: "Fetch policy", range: "7:5", x: 565, y: 370 },
  retry: { label: "Retry", range: "9:5", x: 565, y: 486 },
  exit: { label: "Exit", range: "11:1", x: 195, y: 588 },
};

const edges: Record<EdgeId, { path: string; label?: string }> = {
  "entry-validate": { path: "M380 76 L380 112" },
  "validate-decision": { path: "M380 172 L380 210" },
  "decision-approve": { path: "M338 285 L222 340", label: "true" },
  "decision-fetch": { path: "M422 285 L538 340", label: "false" },
  "fetch-retry": { path: "M565 400 L565 456" },
  "retry-validate": { path: "M535 486 C700 486 700 142 410 142" },
  "approve-exit": { path: "M195 400 L195 558" },
};

function readInitial(): { candidate: CandidateKey; state: StateKey } {
  const params = new URLSearchParams(window.location.search);
  return {
    candidate: params.get("candidate") === "A" ? "A" : "B",
    state: (Object.keys(states).includes(params.get("state") ?? "")
      ? params.get("state")
      : "branch") as StateKey,
  };
}

function updateUrl(candidate: CandidateKey, state: StateKey) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("prototype", "execution-signaling");
    url.searchParams.set("candidate", candidate);
    url.searchParams.set("state", state);
    window.history.replaceState(null, "", url);
  } catch {
    // The prototype stays interactive even when its host URL is unavailable.
  }
}

function ControlFlowDiagram({
  candidate,
  stateKey,
  state,
}: {
  candidate: CandidateKey;
  stateKey: StateKey;
  state: PrototypeState;
}) {
  return (
    <svg
      viewBox="0 0 760 640"
      className="w-full rounded border border-slate-800 bg-slate-950"
      role="img"
      aria-label="Directed control-flow graph for evaluateAccess"
    >
      <defs>
        <marker
          id="arrow"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
        </marker>
        <marker
          id="pulse-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="#67e8f9" />
        </marker>
      </defs>
      {Object.entries(edges).map(([id, edge]) => (
        <g key={id}>
          <path
            d={edge.path}
            fill="none"
            stroke="#475569"
            strokeWidth="2"
            markerEnd="url(#arrow)"
          />
          {candidate === "B" && state.pulse === id && (
            <path
              d={edge.path}
              fill="none"
              stroke="#67e8f9"
              strokeWidth="5"
              markerEnd="url(#pulse-arrow)"
              className="animate-pulse"
            />
          )}
          {edge.label && (
            <text
              x={edge.label === "true" ? 272 : 480}
              y="310"
              fill="#cbd5e1"
              fontSize="14"
              fontWeight="600"
            >
              {edge.label}
            </text>
          )}
        </g>
      ))}
      {(Object.keys(nodes) as NodeId[]).map((id) => {
        const node = nodes[id];
        const current = candidate === "B" && state.current === id;
        const markers =
          candidate === "A"
            ? state.activeRuns.filter((run) => run.node === id)
            : [];
        const fill = current ? "#164e63" : "#0f172a";
        const stroke = current ? "#67e8f9" : "#64748b";
        return (
          <g key={id}>
            {current && (
              <circle
                cx={node.x}
                cy={node.y}
                r="48"
                fill="none"
                stroke="#67e8f9"
                strokeWidth="8"
                opacity="0.25"
                className="animate-pulse"
              />
            )}
            {node.kind === "decision" ? (
              <path
                d={`M${node.x} ${node.y - 42} L${node.x + 52} ${node.y} L${node.x} ${node.y + 42} L${node.x - 52} ${node.y} Z`}
                fill={fill}
                stroke={stroke}
                strokeWidth="2"
              />
            ) : (
              <rect
                x={node.x - 70}
                y={node.y - 30}
                width="140"
                height="60"
                rx="8"
                fill={fill}
                stroke={stroke}
                strokeWidth="2"
              />
            )}
            {current && (
              <text
                x={node.x}
                y={node.y - 48}
                fill="#a5f3fc"
                fontSize="12"
                fontWeight="700"
                textAnchor="middle"
              >
                NOW
              </text>
            )}
            {markers.map((run, index) => (
              <g key={run.id} aria-label={`${run.id} executing ${node.label}`}>
                <circle
                  cx={node.x + 48 - index * 23}
                  cy={node.y - 24}
                  r="11"
                  fill={runColors[run.color].fill}
                  stroke="#0f172a"
                  strokeWidth="3"
                />
                <text
                  x={node.x + 48 - index * 23}
                  y={node.y - 20}
                  fill="#0f172a"
                  fontSize="9"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {run.id.replace("run-", "")}
                </text>
              </g>
            ))}
            <text
              x={node.x}
              y={node.y - 2}
              fill="#f8fafc"
              fontSize="14"
              fontWeight="600"
              textAnchor="middle"
            >
              {node.label}
            </text>
            <text
              x={node.x}
              y={node.y + 16}
              fill="#94a3b8"
              fontSize="11"
              textAnchor="middle"
            >
              {node.range}
            </text>
            {stateKey === "slow" && id === "fetch" && (
              <text
                x={node.x}
                y={node.y + 52}
                fill="#fcd34d"
                fontSize="12"
                fontWeight="600"
                textAnchor="middle"
              >
                Slow · 1.8 s
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function LiveGraphExecutionSignalingPrototype() {
  const initial = readInitial();
  const [candidate, setCandidate] = useState<CandidateKey>(initial.candidate);
  const [stateKey, setStateKey] = useState<StateKey>(initial.state);
  const state = states[stateKey];
  const selectCandidate = (next: CandidateKey) => {
    setCandidate(next);
    updateUrl(next, stateKey);
  };
  const selectState = (next: StateKey) => {
    setStateKey(next);
    updateUrl(candidate, next);
  };
  const diagnostic = stateKey === "diagnostic";

  return (
    <main
      className="h-screen overflow-y-auto overscroll-contain bg-slate-950 p-6 pb-28 text-slate-100"
      data-testid="live-graph-execution-prototype"
    >
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-slate-800 pb-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-violet-300">
            PROTOTYPE · ISSUE #48 · DEVELOPMENT ONLY
          </p>
          <h1 className="mt-1 text-xl font-semibold">Runtime Visualizer</h1>
          <p className="text-sm text-slate-400">
            src/policy.ts · Procedure: evaluateAccess() · revision 84d91f
          </p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-right text-xs">
          <p className="text-slate-400">Inspection state</p>
          <p className="font-medium text-white">{state.label}</p>
        </div>
      </header>
      <div className="grid gap-6 xl:grid-cols-[19rem_minmax(0,1fr)_21rem]">
        <aside className="space-y-4">
          <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="font-medium">Procedure scope</h2>
            <p className="mt-2 font-mono text-xs text-slate-400">
              evaluateAccess(request)
            </p>
            <pre className="mt-3 overflow-auto rounded bg-slate-950 p-3 text-xs leading-6 text-slate-300">{`if (!request.valid) return deny();\nconst policy = fetchPolicy(request);\nreturn policy.allowed ? approve() : retry();`}</pre>
          </section>
          <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="font-medium">State matrix</h2>
            <div className="mt-3 grid gap-1">
              {(Object.keys(states) as StateKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectState(key)}
                  className={`rounded px-2 py-2 text-left text-sm ${key === stateKey ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400" : "text-slate-300 hover:bg-slate-800"}`}
                >
                  {states[key].label}
                </button>
              ))}
            </div>
          </section>
        </aside>
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-medium">Control-flow graph</h2>
              <p className="text-sm text-slate-400">
                Complete possible flow; semantic edges remain visible.
              </p>
            </div>
            <span className="rounded-full border border-slate-700 px-2 py-1 font-mono text-xs text-slate-400">
              7 nodes · 7 edges
            </span>
          </div>
          {diagnostic ? (
            <div
              role="alert"
              className="rounded border border-rose-500/60 bg-rose-500/10 p-5"
            >
              <p className="font-medium text-rose-200">Graph unavailable</p>
              <p className="mt-1 text-sm text-rose-100">
                {state.outcome}. No partial graph is shown.
              </p>
              <p className="mt-3 font-mono text-xs text-rose-200">
                src/policy.ts:6:3
              </p>
            </div>
          ) : (
            <>
              <ControlFlowDiagram
                candidate={candidate}
                stateKey={stateKey}
                state={state}
              />
              <div className="mt-3 rounded border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-300">
                {candidate === "A"
                  ? "Coloured markers identify every active run at its current graph node; the graph itself stays static."
                  : state.pulse
                    ? "Cyan line is the transient transition pulse; only the current node is live."
                    : "Terminal state: no node or edge remains live."}
                {candidate === "A" && state.activeRuns.length > 0 && (
                  <ul
                    className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs"
                    aria-label="Active runs by graph node"
                  >
                    {state.activeRuns.map((run) => (
                      <li key={run.id} className="flex items-center gap-1.5">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${runColors[run.color].className}`}
                        />
                        <span className="font-mono text-slate-200">
                          {run.id}
                        </span>
                        <span className="text-slate-400">
                          {nodes[run.node].label}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
        <aside className="rounded border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Run inspector</h2>
            <span
              className={`rounded-full px-2 py-1 text-xs ${state.terminal === "Failed" ? "bg-rose-500/20 text-rose-200" : state.terminal ? "bg-emerald-500/20 text-emerald-200" : "bg-cyan-500/20 text-cyan-200"}`}
            >
              {state.terminal ?? "Running"}
            </span>
          </div>
          <p className="mt-3 text-sm text-slate-300">{state.detail}</p>
          <div className="mt-5 border-l border-slate-700 pl-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Ordered trace
            </p>
            {state.visited.length ? (
              state.visited.map((id, index) => (
                <div
                  key={`${id}-${index}`}
                  className="relative mt-3 text-sm before:absolute before:-left-[21px] before:top-1 before:h-2 before:w-2 before:rounded-full before:bg-violet-300"
                >
                  <span className="font-mono text-xs text-slate-500">
                    {String(index + 1).padStart(2, "0")}
                  </span>{" "}
                  {nodes[id].label}
                </div>
              ))
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                No trace: graph generation was blocked.
              </p>
            )}
          </div>
          <div className="mt-5 rounded bg-slate-950 p-3">
            <p className="text-xs text-slate-500">Outcome</p>
            <p className="mt-1 text-sm text-white">{state.outcome}</p>
          </div>
        </aside>
      </div>
      <div
        className="fixed inset-x-0 bottom-5 z-10 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-violet-300/70 bg-slate-950 px-3 py-2 shadow-2xl shadow-black"
        role="navigation"
        aria-label="Prototype candidate switcher"
      >
        <span className="hidden px-2 text-xs font-semibold tracking-wide text-violet-200 sm:inline">
          EXECUTION SIGNALING
        </span>
        {(["A", "B"] as CandidateKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => selectCandidate(key)}
            className={`rounded-full px-3 py-1.5 text-sm ${candidate === key ? "bg-violet-300 font-semibold text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}
          >
            {key} · {key === "A" ? "Active run markers" : "Live node + trace"}
          </button>
        ))}
      </div>
    </main>
  );
}
