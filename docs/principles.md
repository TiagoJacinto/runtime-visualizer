# Engineering principles

Standing principles for this codebase. They apply everywhere unless a document
explicitly overrides them.

## Make illegal states unrepresentable

Model state as a closed set of variants so that impossible situations cannot be
constructed, rather than detecting or guarding against them at runtime.

Prefer a discriminated union over a nullable field whose `null` case carries
less information than the type allows. A `RevisionKey | null` field can
represent a half-selected workspace only because the type permits it; a closed
selection state cannot:

```ts
type WorkspaceSelection =
  | { status: "unselected" }
  | { status: "selected"; scope: RevisionKey };
```

Apply this whenever a domain invariant rules out some combinations of values.
Examples in this codebase: `WorkspaceSelection` and `AnalysisPaneState` in
`browser/src/pages/liveWorkspace/useCases/live-workspace.types.ts`.

Consequences:

- Narrowing on the discriminant replaces null checks; runtime guards for
  impossible cases are a code smell, not a safety net.
- State transitions (reducers, query projections) are the only writers of the
  variant; every transition produces exactly one valid variant.
- View models may derive convenience fields (for example `selectedScope:
  RevisionKey | null`) from a closed state, but the closed state stays
  authoritative.
- If a new requirement seems to need a new "impossible" combination, extend the
  variant set deliberately instead of widening an existing variant to `null` or
  optional fields.

Related decisions: ADR 0001 (query-owned resources keep interaction state
separate), ADR 0002 (event lifecycle ownership).
