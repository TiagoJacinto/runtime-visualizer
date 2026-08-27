import { useState } from "react";

/**
 * PROTOTYPE ONLY — issue #48. Development host: ?prototype=execution-signaling.
 *
 * UI contract: compare graph history (A) with one live graph signal plus an
 * inspector trace (B). Both use the same source, Procedure scope, graph,
 * inspector data, dark design system, and viewport. State is in memory.
 */
type CandidateKey = "A" | "B";
type StateKey = "branch" | "loop" | "slow" | "success" | "failure" | "diagnostic";

type PrototypeState = {
  label: string;
  detail: string;
  current: string | null;
  visited: string[];
  pulse: string | null;
  outcome: string;
  terminal?: "Succeeded" | "Failed";
};

const states: Record<StateKey, PrototypeState> = {
  branch: { label: "Branch selection", detail: "The true outcome is chosen; the false route stays visible.", current: "approve", visited: ["entry", "validate", "decision", "approve"], pulse: "decision → approve", outcome: "true" },
  loop: { label: "Repeated loop visit", detail: "validate has been visited three times without making the graph ambiguous.", current: "validate", visited: ["entry", "validate", "decision", "retry", "validate", "decision", "retry", "validate"], pulse: "retry → validate", outcome: "retry #3" },
  slow: { label: "Slow node", detail: "The active statement has exceeded its 800 ms expected duration.", current: "fetch", visited: ["entry", "validate", "decision", "fetch"], pulse: "decision → fetch", outcome: "1.8 s elapsed" },
  success: { label: "Successful completion", detail: "Terminal result is retained in the inspector; no graph path remains live.", current: null, visited: ["entry", "validate", "decision", "approve", "exit"], pulse: null, outcome: "return approved", terminal: "Succeeded" },
  failure: { label: "Terminal failure", detail: "The error and terminal source range remain inspectable after the graph signal clears.", current: null, visited: ["entry", "validate", "decision", "fetch"], pulse: null, outcome: "NetworkError: policy service unavailable", terminal: "Failed" },
  diagnostic: { label: "Graph-blocking diagnostic", detail: "A With statement prevents graph generation; source and Procedure scope remain available.", current: null, visited: [], pulse: null, outcome: "Unsupported With statement" },
};

const nodes = [
  ["entry", "Entry", "1:1"], ["validate", "Validate request", "2:3"], ["decision", "Eligible?", "4:7"],
  ["approve", "Approve", "5:5"], ["fetch", "Fetch policy", "7:5"], ["retry", "Retry", "9:5"], ["exit", "Exit", "11:1"],
] as const;
const edges = ["Entry → Validate request", "Validate request → Eligible?", "Eligible? — true → Approve", "Eligible? — false → Fetch policy", "Fetch policy → Retry", "Retry → Validate request", "Approve → Exit"];

function readInitial(): { candidate: CandidateKey; state: StateKey } {
  const params = new URLSearchParams(window.location.search);
  return { candidate: params.get("candidate") === "A" ? "A" : "B", state: (Object.keys(states).includes(params.get("state") ?? "") ? params.get("state") : "branch") as StateKey };
}

function updateUrl(candidate: CandidateKey, state: StateKey) {
  const url = new URL(window.location.href);
  url.searchParams.set("prototype", "execution-signaling");
  url.searchParams.set("candidate", candidate);
  url.searchParams.set("state", state);
  window.history.replaceState(null, "", url);
}

export function LiveGraphExecutionSignalingPrototype() {
  const initial = readInitial();
  const [candidate, setCandidate] = useState<CandidateKey>(initial.candidate);
  const [stateKey, setStateKey] = useState<StateKey>(initial.state);
  const state = states[stateKey];
  const selectCandidate = (next: CandidateKey) => { setCandidate(next); updateUrl(next, stateKey); };
  const selectState = (next: StateKey) => { setStateKey(next); updateUrl(candidate, next); };
  const diagnostic = stateKey === "diagnostic";

  return <main className="min-h-screen bg-slate-950 p-6 pb-28 text-slate-100" data-testid="live-graph-execution-prototype">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-slate-800 pb-5">
      <div><p className="text-xs font-semibold tracking-[0.2em] text-violet-300">PROTOTYPE · ISSUE #48 · DEVELOPMENT ONLY</p><h1 className="mt-1 text-xl font-semibold">Runtime Visualizer</h1><p className="text-sm text-slate-400">src/policy.ts · Procedure: evaluateAccess() · revision 84d91f</p></div>
      <div className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-right text-xs"><p className="text-slate-400">Inspection state</p><p className="font-medium text-white">{state.label}</p></div>
    </header>
    <div className="grid gap-6 xl:grid-cols-[19rem_minmax(0,1fr)_21rem]">
      <aside className="space-y-4"><section className="rounded border border-slate-800 bg-slate-900/70 p-4"><h2 className="font-medium">Procedure scope</h2><p className="mt-2 font-mono text-xs text-slate-400">evaluateAccess(request)</p><pre className="mt-3 overflow-auto rounded bg-slate-950 p-3 text-xs leading-6 text-slate-300">{`if (!request.valid) return deny();\nconst policy = fetchPolicy(request);\nreturn policy.allowed ? approve() : retry();`}</pre></section><section className="rounded border border-slate-800 bg-slate-900/70 p-4"><h2 className="font-medium">State matrix</h2><div className="mt-3 grid gap-1">{(Object.keys(states) as StateKey[]).map((key) => <button key={key} type="button" onClick={() => selectState(key)} className={`rounded px-2 py-2 text-left text-sm ${key === stateKey ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400" : "text-slate-300 hover:bg-slate-800"}`}>{states[key].label}</button>)}</div></section></aside>
      <section className="min-w-0"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-medium">Control-flow graph</h2><p className="text-sm text-slate-400">Complete possible flow; semantic edges remain visible.</p></div><span className="rounded-full border border-slate-700 px-2 py-1 font-mono text-xs text-slate-400">7 nodes · 7 edges</span></div>{diagnostic ? <div role="alert" className="rounded border border-rose-500/60 bg-rose-500/10 p-5"><p className="font-medium text-rose-200">Graph unavailable</p><p className="mt-1 text-sm text-rose-100">{state.outcome}. No partial graph is shown.</p><p className="mt-3 font-mono text-xs text-rose-200">src/policy.ts:6:3</p></div> : <><div className="grid gap-3 md:grid-cols-2">{nodes.map(([id, label, range]) => { const visits = state.visited.filter((visit) => visit === id).length; const current = state.current === id; const live = candidate === "B" && current; const historical = candidate === "A" && visits > 0; return <div key={id} className={`relative rounded border p-4 ${live ? "border-cyan-300 bg-cyan-400/15 ring-4 ring-cyan-400/20" : historical ? "border-violet-300/80 bg-violet-500/15" : "border-slate-700 bg-slate-900"}`}><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{label}</p><p className="mt-1 font-mono text-xs text-slate-500">{range}</p></div>{live && <span className="rounded-full bg-cyan-300 px-2 py-1 text-xs font-bold text-slate-950">NOW</span>}{historical && <span className="rounded-full bg-violet-300 px-2 py-1 text-xs font-bold text-slate-950">{visits}×</span>}</div>{candidate === "A" && historical && <div className="mt-3 h-1 rounded bg-violet-300/80" />}{candidate === "B" && id === "fetch" && stateKey === "slow" && <p className="mt-3 text-xs font-medium text-amber-300">Slow · 1.8 s</p>}</div>; })}</div><div className="mt-4 rounded border border-slate-800 bg-slate-900/50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Semantic transitions</p><div className="mt-2 flex flex-wrap gap-2">{edges.map((edge) => <span key={edge} className={`rounded px-2 py-1 text-xs ${candidate === "A" && state.visited.length > 0 ? "bg-violet-500/15 text-violet-200" : "bg-slate-800 text-slate-300"}`}>{edge}</span>)}</div>{candidate === "B" && state.pulse && <p className="mt-3 rounded bg-cyan-500/15 px-2 py-2 text-sm text-cyan-100">Transient transition pulse: <strong>{state.pulse}</strong></p>}</div></>}</section>
      <aside className="rounded border border-slate-800 bg-slate-900/70 p-4"><div className="flex items-center justify-between"><h2 className="font-medium">Run inspector</h2><span className={`rounded-full px-2 py-1 text-xs ${state.terminal === "Failed" ? "bg-rose-500/20 text-rose-200" : state.terminal ? "bg-emerald-500/20 text-emerald-200" : "bg-cyan-500/20 text-cyan-200"}`}>{state.terminal ?? "Running"}</span></div><p className="mt-3 text-sm text-slate-300">{state.detail}</p><div className="mt-5 border-l border-slate-700 pl-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ordered trace</p>{state.visited.length ? state.visited.map((id, index) => <div key={`${id}-${index}`} className="relative mt-3 text-sm before:absolute before:-left-[21px] before:top-1 before:h-2 before:w-2 before:rounded-full before:bg-violet-300"><span className="font-mono text-xs text-slate-500">{String(index + 1).padStart(2, "0")}</span> {nodes.find(([node]) => node === id)?.[1]}</div>) : <p className="mt-3 text-sm text-slate-400">No trace: graph generation was blocked.</p>}</div><div className="mt-5 rounded bg-slate-950 p-3"><p className="text-xs text-slate-500">Outcome</p><p className="mt-1 text-sm text-white">{state.outcome}</p></div></aside>
    </div>
    <div className="fixed inset-x-0 bottom-5 z-10 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-violet-300/70 bg-slate-950 px-3 py-2 shadow-2xl shadow-black" role="navigation" aria-label="Prototype candidate switcher"><span className="hidden px-2 text-xs font-semibold tracking-wide text-violet-200 sm:inline">EXECUTION SIGNALING</span>{(["A", "B"] as CandidateKey[]).map((key) => <button key={key} type="button" onClick={() => selectCandidate(key)} className={`rounded-full px-3 py-1.5 text-sm ${candidate === key ? "bg-violet-300 font-semibold text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>{key} · {key === "A" ? "Path overlay" : "Live node + trace"}</button>)}</div>
  </main>;
}
