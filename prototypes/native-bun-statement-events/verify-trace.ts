/// <reference types="bun-types" />

interface StatementEvent {
  column: number;
  kind: string;
  label: string;
  line: number;
  nodeId: string;
  nodeKey: string;
  procedure: string;
  sequence: number;
  source: string;
}

export type { StatementEvent };

const tracePath = process.argv.at(-1);
if (tracePath === undefined) {
  throw new Error("Pass the captured stderr trace path.");
}

const traceText = await Bun.file(tracePath).text();
const lines = traceText.trim().split("\n");

const isStatementEvent = (value: unknown): value is StatementEvent => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "column" in value &&
    typeof value.column === "number" &&
    "kind" in value &&
    typeof value.kind === "string" &&
    "label" in value &&
    typeof value.label === "string" &&
    "line" in value &&
    typeof value.line === "number" &&
    "nodeId" in value &&
    typeof value.nodeId === "string" &&
    "nodeKey" in value &&
    typeof value.nodeKey === "string" &&
    "procedure" in value &&
    typeof value.procedure === "string" &&
    "sequence" in value &&
    typeof value.sequence === "number" &&
    "source" in value &&
    typeof value.source === "string"
  );
};

const isEventArray = (value: unknown): value is StatementEvent[] =>
  Array.isArray(value) && value.every(isStatementEvent);

const parseEvent = (serialized: string): StatementEvent => {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    throw new Error("The captured trace contains invalid event JSON.", { cause: error });
  }
  if (!isStatementEvent(value)) {
    throw new Error("The captured trace contains an invalid event record.");
  }
  return value;
};

const parseReplay = (serialized: string): StatementEvent[] => {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    throw new Error("The captured trace contains invalid replay JSON.", { cause: error });
  }
  if (!isEventArray(value)) {
    throw new Error("The captured replay is not an array of statement events.");
  }
  return value;
};

const liveEvents = lines
  .filter((line) => line.startsWith("LIVE "))
  .map((line) => parseEvent(line.slice("LIVE ".length)));
const replayLines = lines.filter((line) => line.startsWith("REPLAY "));

if (replayLines.length !== 1) {
  throw new Error(`Expected one replay record, received ${replayLines.length}.`);
}

const [replayLine] = replayLines;
if (replayLine === undefined) {
  throw new Error("The replay record disappeared during verification.");
}
const replay = parseReplay(replayLine.slice("REPLAY ".length));
if (JSON.stringify(liveEvents) !== JSON.stringify(replay)) {
  throw new Error("The retained replay does not match the live event order.");
}

if (liveEvents.length === 0) {
  throw new Error("The instrumented run emitted no CFG node events.");
}

for (const [index, event] of liveEvents.entries()) {
  if (event.sequence !== index + 1) {
    throw new Error(`Event ${index + 1} has sequence ${event.sequence}.`);
  }
  if (event.nodeKey !== `${event.source}#${event.procedure}#${event.nodeId}`) {
    throw new Error(`Event ${index + 1} has an invalid procedure-scoped node key.`);
  }
}

const visits = (label: string): number =>
  liveEvents.filter((event) => event.label === label).length;
if (visits("await Promise.resolve()") !== 1) {
  throw new Error("Expected the await statement to emit once.");
}
if (visits("index < changedFiles.length") !== 2) {
  throw new Error("Expected the for-loop decision to emit on both condition checks.");
}
if (visits("attempts < 2") !== 3) {
  throw new Error("Expected the while-loop decision to emit on both iterations and exit.");
}
if (visits("input.approval && needsApproval") !== 1) {
  throw new Error("Expected the if-statement decision to emit once.");
}
if (!liveEvents.some((event) => event.label.startsWith("return "))) {
  throw new Error("Expected the return statement to emit.");
}

console.log(
  `Verified ${liveEvents.length} live CFG-node events, loop visits, and ordered replay.`
);
