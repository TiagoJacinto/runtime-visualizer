/**
 * Throwaway LOGIC prototype for issue #49.
 * Run: bun prototypes/49-execution-history-state-model.ts
 *
 * The graph owns only static nodes plus one currentNodeId. Every observation
 * belongs to a revision-scoped run; history, loop visits, failures, and
 * comparisons never mutate graph path state.
 */

type Status = "running" | "succeeded" | "failed";
type Branch = "true" | "false";
type Revision = { id: string; file: string; sourceHash: string };
type Event =
  | { type: "entered"; nodeId: string; iteration: number }
  | { type: "transitioned"; from: string; to: string; branch?: Branch }
  | { type: "succeeded"; nodeId: string }
  | { type: "failed"; nodeId: string; sourceRange: string; message: string };
type Run = {
  id: string;
  revisionId: string;
  status: Status;
  currentNodeId: string | null;
  events: Event[];
  visits: Record<string, number>;
  terminal: { kind: "success"; nodeId: string } | { kind: "failure"; nodeId: string; sourceRange: string; message: string } | null;
};
type State = { revision: Revision; runs: Run[]; pendingRevision: Revision | null };
type Action =
  | { type: "start"; runId: string }
  | { type: "enter"; runId: string; nodeId: string }
  | { type: "transition"; runId: string; to: string; branch?: Branch }
  | { type: "succeed"; runId: string }
  | { type: "fail"; runId: string; sourceRange: string; message: string }
  | { type: "queue-revision"; revision: Revision }
  | { type: "apply-queued" };

const clone = <T>(value: T): T => structuredClone(value);
const runFor = (state: State, id: string): Run => {
  const run = state.runs.find((candidate) => candidate.id === id);
  if (!run) throw new Error(`Unknown run ${id}`);
  return run;
};
const assertRunning = (run: Run) => {
  if (run.status !== "running") throw new Error(`Run ${run.id} is already ${run.status}`);
};

function reduce(state: State, action: Action): State {
  const next = clone(state);
  if (action.type === "queue-revision") {
    next.pendingRevision = action.revision;
    return next;
  }
  if (action.type === "apply-queued") {
    if (next.runs.some((run) => run.status === "running")) throw new Error("Cannot apply a revision during an active run");
    if (next.pendingRevision) next.revision = next.pendingRevision;
    next.pendingRevision = null;
    return next;
  }

  const run = runFor(next, action.runId);
  if (run.revisionId !== next.revision.id && action.type !== "start") throw new Error("Event revision does not match selected revision");
  if (action.type === "start") {
    if (run.status !== "running") throw new Error(`Run ${run.id} cannot start twice`);
    return next;
  }
  assertRunning(run);
  if (action.type === "enter") {
    const iteration = (run.visits[action.nodeId] ?? 0) + 1;
    run.visits[action.nodeId] = iteration;
    run.currentNodeId = action.nodeId;
    run.events.push({ type: "entered", nodeId: action.nodeId, iteration });
  } else if (action.type === "transition") {
    if (!run.currentNodeId) throw new Error("A transition needs a current node");
    run.events.push({ type: "transitioned", from: run.currentNodeId, to: action.to, branch: action.branch });
  } else if (action.type === "succeed") {
    run.status = "succeeded";
    run.events.push({ type: "succeeded", nodeId: run.currentNodeId ?? "Exit" });
    run.terminal = { kind: "success", nodeId: run.currentNodeId ?? "Exit" };
    run.currentNodeId = null;
  } else if (action.type === "fail") {
    const nodeId = run.currentNodeId ?? "unknown";
    run.status = "failed";
    run.events.push({ type: "failed", nodeId, sourceRange: action.sourceRange, message: action.message });
    run.terminal = { kind: "failure", nodeId, sourceRange: action.sourceRange, message: action.message };
    run.currentNodeId = null;
  }
  return next;
}

function execute(initial: State, actions: Action[]): State {
  return actions.reduce((state, action) => reduce(state, action), initial);
}
function fresh(revisionId = "rev-a"): State {
  return { revision: { id: revisionId, file: "classify.ts", sourceHash: revisionId }, runs: [], pendingRevision: null };
}
function withRun(state: State, id: string, revisionId = state.revision.id): State {
  return { ...state, runs: [...state.runs, { id, revisionId, status: "running", currentNodeId: null, events: [], visits: {}, terminal: null }] };
}
function summary(state: State) {
  return { revision: state.revision.id, pendingRevision: state.pendingRevision?.id ?? null, runs: state.runs.map(({ id, revisionId, status, currentNodeId, visits, terminal, events }) => ({ id, revisionId, status, currentNodeId, visits, terminal, events })) };
}
function compareRuns(state: State, leftId: string, rightId: string) {
  const left = runFor(state, leftId).events.filter((event) => event.type === "transitioned");
  const right = runFor(state, rightId).events.filter((event) => event.type === "transitioned");
  const index = left.findIndex((event, position) => JSON.stringify(event) != JSON.stringify(right[position]));
  return { firstDivergenceTransition: index < 0 ? null : index + 1, leftTerminal: runFor(state, leftId).terminal, rightTerminal: runFor(state, rightId).terminal };
}

function show(name: string, state: State) { console.log(`\n${name}\n${JSON.stringify(summary(state), null, 2)}`); }

console.log("command: bun prototypes/49-execution-history-state-model.ts");
console.log("validated model: graph.currentNodeId is singular; run.events and run.visits retain history; run.revisionId scopes every event");

let state = withRun(fresh(), "run-success");
state = execute(state, [
  { type: "start", runId: "run-success" }, { type: "enter", runId: "run-success", nodeId: "Entry" },
  { type: "transition", runId: "run-success", to: "ready" }, { type: "enter", runId: "run-success", nodeId: "ready" },
  { type: "transition", runId: "run-success", to: "work", branch: "true" }, { type: "enter", runId: "run-success", nodeId: "work" },
  { type: "succeed", runId: "run-success" },
]);
show("1. branch to success", state);

state = withRun(fresh(), "run-loop");
state = execute(state, [
  { type: "enter", runId: "run-loop", nodeId: "loop" }, { type: "transition", runId: "run-loop", to: "loop", branch: "true" },
  { type: "enter", runId: "run-loop", nodeId: "loop" }, { type: "transition", runId: "run-loop", to: "Exit", branch: "false" },
  { type: "succeed", runId: "run-loop" },
]);
show("2. repeated loop visit", state);

state = withRun(fresh(), "run-slow");
state = execute(state, [{ type: "enter", runId: "run-slow", nodeId: "slow" }]);
show("3. slow current node (no synthetic repeat)", state);

state = withRun(fresh(), "run-failure");
state = execute(state, [{ type: "enter", runId: "run-failure", nodeId: "work" }, { type: "fail", runId: "run-failure", sourceRange: "classify.ts:4:3-4:9", message: "network unavailable" }]);
show("4. terminal failure retains source range", state);

state = withRun(withRun(fresh(), "run-a"), "run-b");
state = execute(state, [
  { type: "enter", runId: "run-a", nodeId: "ready" }, { type: "transition", runId: "run-a", to: "work", branch: "true" }, { type: "enter", runId: "run-a", nodeId: "work" }, { type: "succeed", runId: "run-a" },
  { type: "enter", runId: "run-b", nodeId: "ready" }, { type: "transition", runId: "run-b", to: "wait", branch: "false" }, { type: "enter", runId: "run-b", nodeId: "wait" }, { type: "fail", runId: "run-b", sourceRange: "classify.ts:6:3-6:8", message: "timeout" },
]);
show("5. two runs preserve divergence and outcomes", state);
console.log(`comparison: ${JSON.stringify(compareRuns(state, "run-a", "run-b"))}`);

state = withRun(fresh("rev-a"), "run-revision", "rev-a");
state = execute(state, [{ type: "enter", runId: "run-revision", nodeId: "slow" }, { type: "queue-revision", revision: { id: "rev-b", file: "classify.ts", sourceHash: "rev-b" } }]);
show("6a. revision queued while active", state);
state = execute(state, [{ type: "succeed", runId: "run-revision" }, { type: "apply-queued" }]);
show("6b. revision applies only after terminal", state);
try { execute(state, [{ type: "enter", runId: "run-revision", nodeId: "mixed-event" }]); } catch (error) { console.log(`revision boundary guard: ${(error as Error).message}`); }
console.log("rejected alternative: storing visited nodes as graph path state would lose loop iteration order, overload one current marker for multiple runs, and mix revisions; keep all temporal data inside revision-scoped runs instead.");
