import type { AnalysisResponse, RevisionKey } from "@runtime-visualizer/contracts";

export const scope: RevisionKey = {
  file: "main.ts",
  procedureId: "function:run",
  revision: "revision-1",
};

export const analysis: AnalysisResponse = {
  cfg: {
    functions: [],
    procedures: [
      {
        name: "run",
        entry: "entry",
        exit: "exit",
        nodes: [
          {
            id: "import",
            kind: "import",
            label: "value",
            location: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 38 },
            },
          },
          { id: "entry", kind: "entry", label: "entry" },
          {
            id: "return",
            kind: "return",
            label: "return value",
            location: {
              start: { line: 3, column: 3 },
              end: { line: 3, column: 15 },
            },
          },
          { id: "exit", kind: "exit", label: "exit" },
        ],
        edges: [
          { from: "import", to: "entry", kind: "entry" },
          { from: "entry", to: "return", kind: "next" },
          { from: "return", to: "exit", kind: "next" },
        ],
      },
    ],
  },
  diagnostics: [],
  file: scope.file,
  procedure: {
    id: scope.procedureId,
    kind: "Function",
    name: "run",
    label: "run",
  },
  procedureId: scope.procedureId,
  procedures: [
    { id: scope.procedureId, kind: "Function", name: "run", label: "run" },
  ],
  revision: scope.revision,
  source:
    "import { value } from './value';\nfunction run() {\n  return value;\n}",
};

if (analysis.cfg === null) throw new Error("test fixture must include a graph");

export const cfg = analysis.cfg;
