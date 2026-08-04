# Product

<!-- impeccable:product-schema 1 -->

> **Context status:** The user declined the init interview. The product record below is inferred from repository evidence and remains open for correction.

## Platform

web *(inferred from the React/Vite browser application)*

## Users

**Inferred:** An Operator who selects a TypeScript Procedure and inspects its control flow or execution.

## Product Purpose

**Inferred:** Runtime Visualizer helps an Operator understand TypeScript execution. It shows every possible path through a Procedure, highlights the current node during an Execution, and explains why graph generation can fail.

Success means that an Operator can inspect a Procedure, understand its possible paths, follow its active execution, and identify graph or type-checking problems without mistaking a partial graph for a complete one.

## Positioning

**Inferred:** The product combines static control-flow visualization with live execution highlighting in one workspace. It keeps the complete possible graph visible while an Execution moves through it.

## Operating Context

**Inferred:** An Operator works with TypeScript files and selected functions or source ranges. They inspect source and graph views, choose whether to show imports, start and review runs, and inspect diagnostics. The graph must preserve the selected Procedure boundary and may resolve required imported Procedures without expanding them into the local graph.

## Capabilities and Constraints

**Inferred capabilities:**

- Visualize TypeScript `.ts` and `.tsx` Procedures as control-flow graphs.
- Show Entry, Exit, executable, decision, loop, jump, exception, and finally flow.
- Highlight the current Graph node during an active Execution and clear the highlight at completion.
- Show source locations and optionally show current-file imports as context.
- Display diagnostics for syntax errors, type-checking failures, unresolved dependencies, and unsupported `with` statements.

**Inferred constraints:**

- A graph requires successful TypeScript type-checking for the selected Procedure and its required dependencies.
- Unrelated project errors must not block graph generation.
- Nested Procedures remain separate graph scopes.
- TypeScript-only constructs and empty statements are not runtime Graph nodes.
- The interface is an existing React and TypeScript application built with Vite.

**Open decisions:**

- The execution data source and connection contract are not established in this record.
- The supported TypeScript language-version boundary is not established in this record.
- Authentication, collaboration, persistence, and deployment requirements are not established in this record.

## Evidence on Hand

- `CONTEXT.md` — domain terminology and graph behavior.
- `features/*.feature` — acceptance scenarios for graph visualization, execution highlighting, diagnostics, imports, and multi-file analysis.
- `browser/src/components/generated/LiveProcedureWorkspace.tsx` — existing workspace implementation with graph, source, runs, imports, and diagnostics views.
- `browser/package.json` — React, TypeScript, Vite, Mermaid, and related browser tooling.
- `README.md` — local development commands and backend API endpoints.

No real customer, testimonial, benchmark, pricing, or press evidence is present in the inspected repository. Future work must not invent these items.

## Product Principles

**Inferred from the repository:**

1. Show the complete possible flow, not only the path taken by one run.
2. Keep execution state clear without hiding static context.
3. Explain failures instead of presenting partial or misleading output.
4. Respect Procedure boundaries and distinguish local flow from dependency context.
5. Keep source text and location information close to the graph.

## Accessibility & Inclusion

No product-specific accessibility requirement was established. Future work must use standard web accessibility practices, including keyboard access, visible focus, semantic controls, readable contrast, and non-color status cues.
