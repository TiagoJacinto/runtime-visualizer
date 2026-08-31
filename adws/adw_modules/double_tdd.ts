import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, validate } from "./agents";
import { changedPaths, snapshot } from "./permissions";
import { runCommand } from "./quality";
import {
  AgentCall,
  type DoubleTddOutput,
  type DoubleTddState,
  type DoubleTddStateName,
  type EnvelopeBase,
  type QualityResult,
} from "./data_types";
import { PhaseHandle, Run } from "./runner";
import { z } from "zod";

const INITIAL: DoubleTddState = {
  STATE: "S0_SCOPE",
  ACCEPTANCE_FULL_COMMAND: null,
  UNIT_FULL_COMMAND: null,
  FOCUSED_OUTER_COMMAND: null,
  FOCUSED_INNER_COMMAND: null,
  INVENTORY: [],
  SELECTED_EXAMPLE: null,
  OUTER_RED_PROOF: null,
  INNER_RESPONSIBILITY: null,
  INNER_TEST: null,
  INNER_RED_PROOF: null,
  LATEST_RESULTS: {},
};

const TEST_WRITES = [
  "features/",
  "feature/",
  "tests/",
  "test/",
  "specs/",
  "**/*.feature",
  "**/*.test.*",
  "**/*.spec.*",
];
const PLUMBING_WRITES = [
  ...TEST_WRITES,
  "package.json",
  "**/vitest.config.*",
  "**/playwright.config.*",
];
const TEST_PATH = /(^|\/)(features?|tests?|specs?)(\/|$)|\.(feature|test|spec)\.[^/]+$/i;
const PLUMBING_PATH = /(^|\/)(package\.json|.*vitest\.config\.[^/]+|.*playwright\.config\.[^/]+)$/i;

export function isTestPath(path: string) {
  return TEST_PATH.test(path);
}
function isPlumbingPath(path: string) {
  return isTestPath(path) || PLUMBING_PATH.test(path);
}

function statePath(run: Run) {
  const dir = resolve(run.contextHandoffDir, "double_tdd");
  mkdirSync(dir, { recursive: true });
  return resolve(dir, "state.json");
}
const argvSchema = z.array(z.string().trim().min(1)).min(1);
const inventoryEntrySchema = z.object({
  example: z.string(),
  criterion: z.string(),
  high_value_test: z.string().optional(),
  status: z.enum(["handled", "unhandled", "gap"]),
});
const stateNameSchema = z.enum([
  "S0_SCOPE",
  "S1_SELECT_OUTER",
  "S2_WRITE_OUTER",
  "S3_FOCUSED_OUTER",
  "S4_SELECT_INNER",
  "S5_INNER_RED",
  "S6_INNER_GREEN",
  "S7_UNIT_SUITE",
  "S9_FULL_ACCEPTANCE",
  "S10_COVERAGE",
  "DONE",
]);
const doubleTddStateSchema = z.object({
  STATE: stateNameSchema,
  ACCEPTANCE_FULL_COMMAND: argvSchema.nullable(),
  UNIT_FULL_COMMAND: argvSchema.nullable(),
  FOCUSED_OUTER_COMMAND: argvSchema.nullable(),
  FOCUSED_INNER_COMMAND: argvSchema.nullable(),
  INVENTORY: z.array(inventoryEntrySchema),
  SELECTED_EXAMPLE: z.string().nullable(),
  OUTER_RED_PROOF: z.unknown(),
  INNER_RESPONSIBILITY: z.string().nullable(),
  INNER_TEST: z.string().nullable(),
  INNER_RED_PROOF: z.unknown(),
  LATEST_RESULTS: z.record(z.string(), z.unknown()),
});
const doubleTddOutputSchema = z
  .object({
    status: z.enum(["success", "fail"]),
    summary: z.string().optional(),
    artifacts: z.array(z.string()).optional(),
    notes_for_next_agent: z.string().optional(),
    state: stateNameSchema.optional(),
    acceptance_full_command: argvSchema.optional(),
    unit_full_command: argvSchema.optional(),
    focused_outer_command: argvSchema.optional(),
    focused_inner_command: argvSchema.optional(),
    inventory: z.array(inventoryEntrySchema).optional(),
    selected_example: z.string().trim().min(1).optional(),
    criterion: z.string().trim().min(1).optional(),
    oracle: z.string().trim().min(1).optional(),
    high_value_test: z.string().trim().min(1).optional(),
    inner_responsibility: z.string().trim().min(1).optional(),
    inner_test: z.string().trim().min(1).optional(),
    red_proof: z.string().optional(),
    failure_kind: z.enum(["plumbing", "missing_behavior"]).optional(),
    handled: z.boolean().optional(),
    acceptance_gap: z.boolean().optional(),
  })
  .passthrough();
const qualityCheckSchema = z.object({
  name: z.string(),
  area: z.string(),
  operation: z.string(),
  command: z.string(),
  returncode: z.number(),
  passed: z.boolean(),
  duration_seconds: z.number(),
  output_artifact: z.string(),
  stdout_artifact: z.string().optional(),
  stderr_artifact: z.string().optional(),
  output_tail: z.string().optional(),
  failure: z.string().optional(),
  truncated: z.boolean().optional(),
});
const qualityResultSchema = z.object({
  passed: z.boolean(),
  checks: z.array(qualityCheckSchema),
  failures: z.array(z.string()),
  artifacts: z.array(z.string()),
});
const requestSchema = z.object({
  config: z.string().trim().min(1),
  adwId: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(1),
});

function requireCommand(value: unknown, label: string): string[] {
  try {
    return argvSchema.parse(value);
  } catch {
    throw new Error(`${label} must be a non-empty argv array`);
  }
}

function cloneInitial(): DoubleTddState {
  return doubleTddStateSchema.parse({ ...INITIAL, INVENTORY: [], LATEST_RESULTS: {} });
}
function parseState(value: unknown): DoubleTddState {
  return doubleTddStateSchema.parse(value);
}
function loadState(run: Run): DoubleTddState {
  try {
    return parseState(JSON.parse(readFileSync(statePath(run), "utf8")));
  } catch {
    return cloneInitial();
  }
}
function saveState(run: Run, state: DoubleTddState) {
  const validState = parseState(state);
  run.writeEvidence("double_tdd_state.json", validState);
  Bun.write(statePath(run), JSON.stringify(validState, null, 2));
}

function previous(state: DoubleTddState): EnvelopeBase & DoubleTddState {
  return { status: "success", summary: `Double-TDD state ${state.STATE}`, ...parseState(state) };
}

export function assertOnlyPermittedPaths(
  run: Run,
  before: Record<string, string>,
  permitted: (path: string) => boolean,
  label: string,
) {
  const changed = changedPaths(before, snapshot(run));
  const bad = changed.filter((path) => !permitted(path));
  if (bad.length) throw new Error(`${label} changed unauthorized paths: ${bad.join(", ")}`);
  return changed;
}
export function assertProductionOnly(run: Run, before: Record<string, string>) {
  return assertOnlyPermittedPaths(run, before, (path) => !isPlumbingPath(path), "S6_INNER_GREEN");
}

async function callAgent(
  run: Run,
  phaseName: string,
  instruction: string,
  state: DoubleTddState,
  allowedWrites: string[] | undefined,
  permitted: ((path: string) => boolean) | undefined,
) {
  const before = snapshot(run);
  let output: EnvelopeBase | undefined;
  await run.phase(
    {
      name: phaseName,
      kind: "agent",
      owner: "double_tdd",
      retries: 1,
      description: instruction,
      allowed_writes: allowedWrites,
    },
    async (ph: PhaseHandle) => {
      output = await ph.call(new AgentCall("DoubleTddOutput", instruction, previous(state)));
    },
  );
  if (permitted) assertOnlyPermittedPaths(run, before, permitted, phaseName);
  if (!output) throw new Error(`${phaseName} did not return an output`);
  return output;
}

async function runWorkflowCommand(
  run: Run,
  state: DoubleTddState,
  phaseName: string,
  argv: string[],
): Promise<QualityResult> {
  const validArgv = argvSchema.parse(argv);
  let result: QualityResult | undefined;
  await run.phase(
    {
      name: phaseName,
      kind: "code",
      owner: "quality",
      description: `Run ${phaseName} and record its evidence before the next state transition`,
    },
    async (ph: PhaseHandle) => {
      result = qualityResultSchema.parse(await runCommand(run, phaseName, validArgv));
      state.LATEST_RESULTS[phaseName] = result;
      saveState(run, state);
      ph.log({
        passed: result.passed,
        command: result.checks[0]?.command,
        artifacts: result.artifacts,
      });
    },
  );
  if (!result) throw new Error(`${phaseName} did not return a quality result`);
  return result;
}

async function classifyFailure(
  run: Run,
  state: DoubleTddState,
  phaseName: string,
  failure: unknown,
) {
  state.LATEST_RESULTS[`${phaseName}_failure`] = failure;
  const output = await callAgent(
    run,
    `${phaseName}_classify`,
    "Classify the latest test failure as plumbing or missing_behavior. Use the command output and the intended observation, not production code guesses. Do not edit files.",
    state,
    [],
    () => false,
  );
  if (output.failure_kind !== "plumbing" && output.failure_kind !== "missing_behavior")
    throw new Error(`${phaseName} classification must set failure_kind`);
  return output;
}

async function repairPlumbing(
  run: Run,
  state: DoubleTddState,
  phaseName: string,
  failure: unknown,
) {
  state.LATEST_RESULTS[`${phaseName}_failure`] = failure;
  return callAgent(
    run,
    `${phaseName}_repair_plumbing`,
    "Repair only the test plumbing, fixtures, bindings, configuration, or environment issue shown by the latest failure. Do not change production behavior. Return the same DoubleTddOutput JSON.",
    state,
    PLUMBING_WRITES,
    isPlumbingPath,
  );
}

export function validateOutputForState(
  state: DoubleTddStateName,
  output: unknown,
): DoubleTddOutput {
  const validState = stateNameSchema.parse(state);
  const parsed = doubleTddOutputSchema.parse(output);
  if (parsed.status !== "success") throw new Error(`${validState} requires a success output`);
  const require = (field: string, schema: z.ZodType) => {
    const value = parsed[field as keyof typeof parsed];
    if (value === undefined) throw new Error(`${field} is required`);
    schema.parse(value);
  };
  if (validState === "S0_SCOPE") {
    for (const field of [
      "acceptance_full_command",
      "unit_full_command",
      "focused_outer_command",
      "focused_inner_command",
    ])
      require(field, argvSchema);
    require("inventory", z.array(inventoryEntrySchema));
  }
  if (validState === "S1_SELECT_OUTER") {
    for (const field of ["selected_example", "criterion", "oracle"])
      require(field, z.string().trim().min(1));
    if (parsed.acceptance_gap === true) require("artifacts", z.array(z.string()).min(1));
  }
  if (validState === "S2_WRITE_OUTER") {
    require("high_value_test", z.string().trim().min(1));
    require("focused_outer_command", argvSchema);
  }
  if (validState === "S4_SELECT_INNER") require("inner_responsibility", z.string().trim().min(1));
  if (validState === "S5_INNER_RED") {
    require("inner_test", z.string().trim().min(1));
    require("focused_inner_command", argvSchema);
  }
  if (validState === "S10_COVERAGE") require("handled", z.boolean());
  return parsed as DoubleTddOutput;
}

export async function run(x: unknown) {
  const request = requestSchema.parse(x);
  const cfg = loadConfig(request.config);
  validate(cfg, ["double_tdd"]);
  const { ensure } = await import("./session");
  const run = ensure(cfg, request.adwId);
  let state = loadState(run);
  let transitions = 0;

  await run.phase(
    {
      name: "request",
      kind: "engineer",
      owner: run.engineer,
      description: "Capture the double-TDD request and its acceptance target",
    },
    (ph) => ph.log({ input: request.prompt }),
  );

  while (state.STATE !== "DONE") {
    if (++transitions > 100) return run.finish(false, "double-TDD exceeded 100 state transitions");
    saveState(run, state);

    if (state.STATE === "S0_SCOPE") {
      const scoped = validateOutputForState(
        state.STATE,
        await callAgent(
          run,
          `s0_scope_${transitions}`,
          "Apply custom-testing. Read the request, domain definitions, context maps, ADRs, acceptance specs, nearby tests, and runner configuration. Identify exact full and focused argv commands for both runners, inventory every concrete acceptance example, map criteria to examples or explicit gaps, and report baseline requirements. Do not edit repository files.",
          state,
          [],
          () => false,
        ),
      );
      Object.assign(state, scoped, {
        ACCEPTANCE_FULL_COMMAND: scoped.acceptance_full_command,
        UNIT_FULL_COMMAND: scoped.unit_full_command,
        FOCUSED_OUTER_COMMAND: scoped.focused_outer_command,
        FOCUSED_INNER_COMMAND: scoped.focused_inner_command,
        INVENTORY: scoped.inventory,
        STATE: "S0_SCOPE",
      });
      state.LATEST_RESULTS.baseline_acceptance = await runWorkflowCommand(
        run,
        state,
        `baseline_acceptance_${transitions}`,
        requireCommand(state.ACCEPTANCE_FULL_COMMAND, "acceptance_full_command"),
      );
      state.LATEST_RESULTS.baseline_unit = await runWorkflowCommand(
        run,
        state,
        `baseline_unit_${transitions}`,
        requireCommand(state.UNIT_FULL_COMMAND, "unit_full_command"),
      );
      state.STATE = "S1_SELECT_OUTER";
      continue;
    }

    if (state.STATE === "S1_SELECT_OUTER") {
      const selectionBefore = snapshot(run);
      const selected = validateOutputForState(
        state.STATE,
        await callAgent(
          run,
          `s1_select_outer_${transitions}`,
          "Select exactly one existing unhandled acceptance example. If all existing examples are handled, define one necessary example for the next uncovered success, failure, or meaningful edge case. Apply custom-gherkin and derive every expected outcome from an independent oracle. If you add an example, change only that acceptance artifact.",
          state,
          TEST_WRITES,
          isTestPath,
        ),
      );
      const selectionChanges = changedPaths(selectionBefore, snapshot(run));
      if (selected.acceptance_gap ? selectionChanges.length !== 1 : selectionChanges.length !== 0)
        throw new Error(
          "S1_SELECT_OUTER must change exactly one acceptance artifact only when a gap exists",
        );
      Object.assign(state, selected, { SELECTED_EXAMPLE: selected.selected_example });
      state.STATE = "S2_WRITE_OUTER";
      continue;
    }

    if (state.STATE === "S2_WRITE_OUTER") {
      const outerTestBefore = snapshot(run);
      const written = validateOutputForState(
        state.STATE,
        await callAgent(
          run,
          `s2_write_outer_${transitions}`,
          "Write exactly one discoverable high-value unit test for SELECTED_EXAMPLE. Invoke the application-level public API, bind every example value faithfully, choose result, state, or communication verification, and do not change production code or unrelated tests.",
          state,
          TEST_WRITES,
          isTestPath,
        ),
      );
      if (changedPaths(outerTestBefore, snapshot(run)).length !== 1)
        throw new Error("S2_WRITE_OUTER must write exactly one high-value test file");
      Object.assign(state, written, {
        FOCUSED_OUTER_COMMAND: written.focused_outer_command,
        STATE: "S3_FOCUSED_OUTER",
      });
      continue;
    }

    if (state.STATE === "S3_FOCUSED_OUTER") {
      const result = await runWorkflowCommand(
        run,
        state,
        `s3_focused_outer_${transitions}`,
        requireCommand(state.FOCUSED_OUTER_COMMAND, "focused_outer_command"),
      );
      state.LATEST_RESULTS.focused_outer = result;
      if (result.passed) {
        state.OUTER_RED_PROOF = null;
        state.STATE = "S9_FULL_ACCEPTANCE";
        continue;
      }
      state.OUTER_RED_PROOF = result.failures;
      const diagnosis = await classifyFailure(run, state, `s3_${transitions}`, result);
      if (diagnosis.failure_kind === "plumbing") {
        await repairPlumbing(run, state, `s3_${transitions}`, result);
        continue;
      }
      state.STATE = "S4_SELECT_INNER";
      continue;
    }

    if (state.STATE === "S4_SELECT_INNER") {
      const selected = validateOutputForState(
        state.STATE,
        await callAgent(
          run,
          `s4_select_inner_${transitions}`,
          "From the current outer failure, choose the smallest missing Level 1 or Level 2 responsibility and name its public API. Keep application-level decisions and coordination in the Controller. Do not edit repository files.",
          state,
          [],
          () => false,
        ),
      );
      Object.assign(state, selected, { INNER_RESPONSIBILITY: selected.inner_responsibility });
      state.STATE = "S5_INNER_RED";
      continue;
    }

    if (state.STATE === "S5_INNER_RED") {
      const innerTestBefore = snapshot(run);
      const written = validateOutputForState(
        state.STATE,
        await callAgent(
          run,
          `s5_inner_red_${transitions}`,
          "Write exactly one typical Level 1 or Level 2 unit test for INNER_RESPONSIBILITY. Use result verification for Level 1 or state verification for Level 2. Do not change production code. Return the focused unit command.",
          state,
          TEST_WRITES,
          isTestPath,
        ),
      );
      if (changedPaths(innerTestBefore, snapshot(run)).length !== 1)
        throw new Error("S5_INNER_RED must write exactly one typical unit test file");
      Object.assign(state, written, {
        INNER_TEST: written.inner_test,
        FOCUSED_INNER_COMMAND: written.focused_inner_command,
      });
      const result = await runWorkflowCommand(
        run,
        state,
        `s5_focused_inner_${transitions}`,
        requireCommand(state.FOCUSED_INNER_COMMAND, "focused_inner_command"),
      );
      state.LATEST_RESULTS.focused_inner = result;
      if (result.passed) {
        state.INNER_RESPONSIBILITY = null;
        state.INNER_TEST = null;
        state.INNER_RED_PROOF = null;
        state.STATE = "S4_SELECT_INNER";
        continue;
      }
      const diagnosis = await classifyFailure(run, state, `s5_${transitions}`, result);
      if (diagnosis.failure_kind === "plumbing") {
        await repairPlumbing(run, state, `s5_${transitions}`, result);
        continue;
      }
      state.INNER_RED_PROOF = result.failures;
      state.STATE = "S6_INNER_GREEN";
      continue;
    }

    if (state.STATE === "S6_INNER_GREEN") {
      const before = snapshot(run);
      await callAgent(
        run,
        `s6_inner_green_${transitions}`,
        "Implement the smallest behavior that satisfies INNER_TEST. Connect it through the use case Controller. Change production behavior only; do not edit tests, acceptance examples, or configuration.",
        state,
        undefined,
        undefined,
      );
      assertProductionOnly(run, before);
      const result = await runWorkflowCommand(
        run,
        state,
        `s6_focused_inner_${transitions}`,
        requireCommand(state.FOCUSED_INNER_COMMAND, "focused_inner_command"),
      );
      state.LATEST_RESULTS.focused_inner = result;
      if (result.passed) state.STATE = "S7_UNIT_SUITE";
      continue;
    }

    if (state.STATE === "S7_UNIT_SUITE") {
      const result = await runWorkflowCommand(
        run,
        state,
        `s7_unit_suite_${transitions}`,
        requireCommand(state.UNIT_FULL_COMMAND, "unit_full_command"),
      );
      state.LATEST_RESULTS.full_unit = result;
      if (result.passed) {
        state.INNER_RESPONSIBILITY = null;
        state.INNER_TEST = null;
        state.INNER_RED_PROOF = null;
        state.STATE = "S3_FOCUSED_OUTER";
      } else state.STATE = "S6_INNER_GREEN";
      continue;
    }

    if (state.STATE === "S9_FULL_ACCEPTANCE") {
      const result = await runWorkflowCommand(
        run,
        state,
        `s9_full_acceptance_${transitions}`,
        requireCommand(state.ACCEPTANCE_FULL_COMMAND, "acceptance_full_command"),
      );
      state.LATEST_RESULTS.full_acceptance = result;
      if (result.passed) {
        state.STATE = "S10_COVERAGE";
        continue;
      }
      const diagnosis = await classifyFailure(run, state, `s9_${transitions}`, result);
      if (diagnosis.failure_kind === "plumbing") {
        await repairPlumbing(run, state, `s9_${transitions}`, result);
        continue;
      }
      state.OUTER_RED_PROOF = result.failures;
      if (typeof diagnosis.selected_example === "string")
        state.SELECTED_EXAMPLE = diagnosis.selected_example;
      state.STATE = "S4_SELECT_INNER";
      continue;
    }

    if (state.STATE === "S10_COVERAGE") {
      const checked = validateOutputForState(
        state.STATE,
        await callAgent(
          run,
          `s10_coverage_${transitions}`,
          "Reconcile the inventory against every requested success, failure, meaningful edge case, relied-upon Level 1 or Level 2 responsibility, Controller design, domain definition, and latest full-suite evidence. Do not rerun either suite. Return handled=true only when every completion condition is proven. Do not edit repository files.",
          state,
          [],
          () => false,
        ),
      );
      Object.assign(state, checked);
      state.STATE = checked.handled ? "DONE" : "S1_SELECT_OUTER";
      continue;
    }

    return run.finish(false, `unknown double-TDD state: ${state.STATE}`);
  }

  saveState(run, state);
  return run.finish(true);
}
