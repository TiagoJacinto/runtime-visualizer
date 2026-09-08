// @ts-check
// Deep-module enforcement for src/modules.
// Root files are public entry points; every subfolder is private implementation.

const PACKAGES_ROOT = "src/modules";
const R = PACKAGES_ROOT;
const PACKAGE_INTERNALS = `^${R}/[^/]+/[^/]+/`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "entrypoint-boundary-from-app",
      comment:
        "Code outside a module may import its root entry points, but never files in its subfolders.",
      severity: "error",
      from: { pathNot: `^(?:${R}/|tests/)` },
      to: { path: PACKAGE_INTERNALS },
    },
    {
      name: "entrypoint-boundary-across-modules",
      comment:
        "A module may use its own implementation freely, but reaches other modules only through root entry points.",
      severity: "error",
      from: { path: `^${R}/([^/]+)/`, pathNot: `^${R}/[^/]+/tests/` },
      to: {
        path: PACKAGE_INTERNALS,
        pathNot: `^${R}/$1/`,
      },
    },
    {
      name: "tests-through-entrypoints",
      comment:
        "Tests exercise modules through their root entry points, except approved in-memory test doubles.",
      severity: "error",
      from: { path: "^tests/" },
      to: {
        path: `^${R}/[^/]+/[^/]+/`,
        // In-memory adapters are test doubles, not infrastructure dependencies.
        pathNot: `^${R}/[^/]+/infra/inMemory[^/]*\\.ts$`,
      },
    },
    {
      name: "tests-through-shared-entrypoints",
      comment:
        "Tests use shared module entry points instead of implementation subfolders.",
      severity: "error",
      from: { path: "^tests/" },
      to: {
        path: "^src/shared/[^/]+/",
        // The composition root is explicitly handled as test infrastructure below.
        pathNot: "^src/shared/infra/http/app\\.ts$",
      },
    },
    {
      name: "unit-tests-avoid-composition-infrastructure",
      comment:
        "Pure unit tests do not construct the application infrastructure; app-level suites may use the composition root.",
      severity: "error",
      from: {
        path: "^tests/",
        pathNot:
          "^tests/(?:acceptance/(?!unit/)|typical/(?:integration/|e2e/))",
      },
      to: { path: "^src/shared/infra/http/app\\.ts$" },
    },
    {
      name: "tests-folder-is-private",
      comment: "Only tests may import files from a module's tests folder.",
      severity: "error",
      from: { pathNot: `^${R}/[^/]+/tests/` },
      to: { path: `^${R}/[^/]+/tests/` },
    },
    {
      name: "no-circular",
      comment: "No dependency cycles.",
      severity: "error",
      from: {},
      to: { circular: true },
    },

    // Layering controls which modules may depend on which. Add repository-specific
    // rules here when those dependency directions need deterministic enforcement.
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
  },
};
