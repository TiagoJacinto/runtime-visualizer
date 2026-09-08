# Ultracite configuration

The repository uses one root Oxlint/Oxfmt policy for the monorepo:

- `oxlint.config.ts` composes Ultracite core, React, Vitest, and anti-slop rules.
- `oxfmt.config.ts` composes the Ultracite Oxfmt preset.
- `bun run lint` and `bun run check` target `browser/src` and `backend/src`; tests and tooling retain their existing formatting conventions.

Keep shared policy in the root configs. Add a package-specific override only when a package has a genuinely different runtime contract; do not add duplicate per-package configs for ordinary source differences. TypeScript configs may import presets and shared constants normally because Oxlint and Oxfmt load them through their JavaScript/TypeScript config loaders.

Run `bun run check` before submitting source changes. Use `bun run fix` for the scoped autofix, then review the diff because filename casing and import paths are part of the source contract.
