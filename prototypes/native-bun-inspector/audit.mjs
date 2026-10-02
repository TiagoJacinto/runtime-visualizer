// Fixture-specific evidence audit, not a general source-map/CFG execution adapter.
/* oxlint-disable no-await-in-loop -- Read one captured run at a time to bound memory while auditing the large protocol log. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { analyseFileProcedure } from "../../browser/src/modules/analysis/cfg/file-analyzer.ts";

const [root] = process.argv.slice(2);
assert.ok(
  root,
  "Pass an evidence root containing main-probe, timing-control, timing-probe"
);
const readResult = (name) =>
  Bun.file(path.join(root, name, "result.json")).json();
const parse = (serialized) => {
  try {
    return JSON.parse(serialized);
  } catch (error) {
    throw new Error("Malformed captured inspector evidence", { cause: error });
  }
};
const main = await readResult("main-probe");
const control = await readResult("timing-control");
const timed = await readResult("timing-probe");
for (const result of [main, control, timed]) {
  assert.equal(result.error, null);
  assert.equal(result.baseline.exitCode, 0);
  assert.equal(result.target.exitCode, 0);
  assert.equal(result.pausedAfterStart, 0);
}
assert.equal(
  main.target.stdout,
  main.baseline.stdout,
  "Source introspection, error stack and values match in this fixture"
);
const source = await Bun.file(
  path.join(import.meta.dirname, "fixture/workflow.ts")
).text();
const [procedure] = analyseFileProcedure(source, "workflow.ts", {
  functionName: "visit",
}).procedures;
const sourceNodes = procedure.nodes.filter(
  (node) => node.location !== undefined
);
assert.equal(sourceNodes.length, 13);
const node = (label, occurrence = 0) => {
  const selected = sourceNodes.filter((entry) => entry.label === label)[
    occurrence
  ];
  assert.ok(selected, label);
  return selected;
};
const script = main.scripts.find((entry) => entry.url.endsWith("/workflow.ts"));
const generatedSource = await Bun.file(
  path.join(root, "main-probe/workflow.ts.inspector-source.txt")
).text();
const generated = generatedSource.split("\n");
const breakpoints = main.breakpointResults.filter(
  (entry) => entry.requested?.scriptId === script.scriptId
);
const point = (expression, needle = expression) => {
  const lineNumber = generated.findIndex((line) => line.includes(expression));
  assert.notEqual(lineNumber, -1, expression);
  return {
    columnNumber: generated[lineNumber].indexOf(needle),
    lineNumber,
    scriptId: script.scriptId,
  };
};
const breakpointAt = (location) =>
  breakpoints.find(
    (entry) =>
      entry.requested.lineNumber === location.lineNumber &&
      entry.requested.columnNumber === location.columnNumber
  );
const hitsAt = (location) => {
  const breakpoint = breakpointAt(location);
  return breakpoint
    ? main.replay.filter((sample) => sample.probeId === breakpoint.actionId)
        .length
    : null;
};
const rows = [
  [
    node("const seen: (number | string)[] = [];"),
    2,
    point("const seen = []", "const"),
  ],
  [node("let index = 0"), 2, point("let index = 0")],
  [node("index < 2"), 6, point("index < 2")],
  [node("index += 1"), 4, point("index += 1")],
  [node("seen.push(index)"), 4, point("seen.push(index)")],
  [node("flag", 0), 2, point("flag &&", "flag")],
  [node('seen.push("and")'), 1, point('seen.push("and")')],
  [node("flag", 1), 2, point("flag ||", "flag")],
  [node('seen.push("or")'), 1, point('seen.push("or")')],
  [
    node('const maybe = flag ? { value: "present" } : undefined;'),
    2,
    point("const maybe", "const"),
  ],
  [node("maybe"), 2, point("maybe?.value", "maybe")],
  [node("maybe.value"), 1, point("maybe?.value", "value")],
  [node("return seen"), 2, point("return seen")],
].map(([cfgNode, expectedVisits, generatedLocation]) => ({
  cfgNode,
  dedicatedLocationHits: hitsAt(generatedLocation),
  expectedVisits,
  generatedLocation,
  probeId: breakpointAt(generatedLocation)?.actionId ?? null,
}));
assert.deepEqual(
  rows
    .filter((row) => row.dedicatedLocationHits === null)
    .map((row) => row.cfgNode.label),
  ['seen.push("and")', 'seen.push("or")', "maybe.value"]
);
for (const row of rows.filter(
  (entry) => entry.dedicatedLocationHits !== null
)) {
  assert.equal(row.dedicatedLocationHits, row.expectedVisits);
}
const start = point("const seen = []", "const").lineNumber;
const end = point("return seen").lineNumber;
const visitActionIds = new Set(
  breakpoints
    .filter(
      (entry) =>
        entry.requested.scriptId === script.scriptId &&
        entry.requested.lineNumber >= start &&
        entry.requested.lineNumber <= end
    )
    .map((entry) => entry.actionId)
);
const visits = main.replay
  .filter((sample) => visitActionIds.has(sample.probeId))
  .map((sample) => sample.probeId);
assert.equal(visits.length, 28);
assert.deepEqual(
  visits.slice(0, 14),
  visits.slice(14),
  "Different CFG paths produce identical constant-location probe sequences"
);
const expectedInvocation = (flag) => {
  const labels = [
    rows[0],
    rows[1],
    rows[2],
    rows[4],
    rows[3],
    rows[2],
    rows[4],
    rows[3],
    rows[2],
    rows[5],
  ];
  if (flag) {
    labels.push(rows[6]);
  }
  labels.push(rows[7]);
  if (!flag) {
    labels.push(rows[8]);
  }
  labels.push(rows[9], rows[10]);
  if (flag) {
    labels.push(rows[11]);
  }
  labels.push(rows[12]);
  return labels.map((row) => row.cfgNode.id);
};
const directNodeForProbe = new Map(
  rows
    .filter((row) => row.probeId !== null)
    .map((row) => [row.probeId, row.cfgNode.id])
);
const actualMappedCfgVisits = [visits.slice(0, 14), visits.slice(14)].map(
  (ids) => ids.map((probeId) => directNodeForProbe.get(probeId))
);
for (const [index, flag] of [true, false].entries()) {
  assert.deepEqual(
    actualMappedCfgVisits[index],
    expectedInvocation(flag).filter((nodeId) =>
      rows.some((row) => row.cfgNode.id === nodeId && row.probeId !== null)
    )
  );
}
const timing = [control, timed].map((result) => ({
  baseline: parse(result.baseline.stdout),
  mode: result.mode,
  observed: parse(result.target.stdout),
  samples: result.replay.length,
}));
assert.equal(timing[0].observed.outcome, "within-deadline");
assert.equal(timing[1].baseline.outcome, "within-deadline");
assert.equal(timing[1].observed.outcome, "missed-deadline");
assert.equal(timing[1].observed.total, timing[1].baseline.total);
assert.equal(timing[1].samples, 30_008);
for (const name of ["main-probe", "timing-probe"]) {
  const result = name === "main-probe" ? main : timed;
  const protocolText = await Bun.file(
    path.join(root, name, "protocol.jsonl")
  ).text();
  const records = protocolText
    .trim()
    .split("\n")
    .map((line) => parse(line));
  const received = records
    .filter(
      (record) =>
        record.direction === "receive" &&
        record.message.method === "Debugger.didSampleProbe"
    )
    .map((record, index) => ({
      sequence: index + 1,
      ...record.message.params.sample,
    }));
  const liveText = await Bun.file(path.join(root, name, "live.jsonl")).text();
  const live = liveText
    .trim()
    .split("\n")
    .map((line) => parse(line));
  assert.deepEqual(live, received);
  assert.deepEqual(result.replay, received);
}
const summary = {
  actualMappedCfgVisits,
  actualProbeIds: [visits.slice(0, 14), visits.slice(14)],
  expectedCfgVisits: [expectedInvocation(true), expectedInvocation(false)],
  orderedReplayMatchesReceivedProbes: true,
  procedure,
  rows,
  sourceAndStackParity: true,
  timing,
  verdict: "Tested inspector candidate fails the strict contract",
};
writeFileSync(
  path.join(root, "audit.json"),
  `${JSON.stringify(summary, null, 2)}\n`
);
console.log(
  JSON.stringify(
    {
      actualLocationHitCounts: [
        visits.slice(0, 14).length,
        visits.slice(14).length,
      ],
      expectedVisitCounts: summary.expectedCfgVisits.map(
        (entries) => entries.length
      ),
      missingDedicatedLocations: rows
        .filter((row) => row.dedicatedLocationHits === null)
        .map((row) => row.cfgNode.id),
      orderedReplayMatchesReceivedProbes: true,
      sourceBackedNodes: sourceNodes.length,
      timing,
      verdict: summary.verdict,
    },
    null,
    2
  )
);
