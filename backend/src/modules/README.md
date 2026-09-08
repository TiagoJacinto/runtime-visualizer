# Deep modules

Each immediate directory under `backend/src/modules/` is a deep module: it provides substantial behavior behind a small interface. Copy this shape when adding one:

```text
backend/src/modules/<name>/
├── index.ts          # public entry point
├── client.ts         # optional additional public entry point
├── lib/              # private implementation
└── tests/            # private tests and fixtures
```

**Entry-point seam.** Import a module only through its root files. Every root file is a public entry point; every file in a subfolder is private. Add several focused root entry points when callers need distinct interfaces.

**Intra-module freedom.** Implementation files within one module may import each other freely. Keep behavior behind the module's small interface to preserve depth and locality.

**Tests through entry points.** Tests import modules through their root entry points, just like production callers. This keeps tests on the same interface seam as callers and prevents tests from coupling to infrastructure or use-case implementation folders. The approved exceptions are direct imports of `infra/inMemory*.ts` test doubles and the shared HTTP composition root from acceptance, integration, or end-to-end suites; pure unit tests stay away from application infrastructure.

**No cycles.** Module dependencies must remain acyclic. Layering—deciding which modules may depend on which—is separate and can be added to `backend/.dependency-cruiser.cjs` when required.

Do not build giant barrel files that re-export implementation trees. Prefer several small entry points such as `index.ts`, `client.ts`, and `server.ts`.

Run `bun run lint:boundaries` from the repository root to verify these rules.
