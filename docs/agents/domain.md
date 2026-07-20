# Domain Docs

How engineering skills should consume this repository's domain documentation.

## Before exploring, read these

- `CONTEXT.md` at the repository root.
- Relevant ADRs under `docs/adr/`.

If these files do not exist, proceed silently. Create them lazily only when domain terminology or architectural decisions are resolved.

## Layout

This is a single-context repository:

```
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Use the glossary's vocabulary

Use domain terms as defined in `CONTEXT.md`. Avoid synonyms the glossary explicitly rejects.

If a required concept is absent, reconsider whether it belongs or note the gap for domain modeling.

## Flag ADR conflicts

Explicitly surface output that contradicts an existing ADR rather than silently overriding it.
