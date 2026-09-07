export type DoubleTddStateName =
  | "S0_SCOPE"
  | "S1_SELECT_OUTER"
  | "S2_WRITE_OUTER"
  | "S3_FOCUSED_OUTER"
  | "S4_SELECT_INNER"
  | "S5_INNER_RED"
  | "S6_INNER_GREEN"
  | "S7_UNIT_SUITE"
  | "S9_FULL_ACCEPTANCE"
  | "S10_COVERAGE"
  | "DONE";
export interface DoubleTddInventoryEntry {
  example: string;
  criterion: string;
  high_value_test?: string;
  status: "handled" | "unhandled" | "gap";
}
export interface DoubleTddState {
  STATE: DoubleTddStateName;
  ACCEPTANCE_FULL_COMMAND: string[] | null;
  UNIT_FULL_COMMAND: string[] | null;
  FOCUSED_OUTER_COMMAND: string[] | null;
  FOCUSED_INNER_COMMAND: string[] | null;
  INVENTORY: DoubleTddInventoryEntry[];
  SELECTED_EXAMPLE: string | null;
  OUTER_RED_PROOF: unknown;
  INNER_RESPONSIBILITY: string | null;
  INNER_TEST: string | null;
  INNER_RED_PROOF: unknown;
  LATEST_RESULTS: Record<string, unknown>;
}
export interface DoubleTddOutput {
  status: "success";
  state?: DoubleTddStateName;
  acceptance_full_command?: string[];
  unit_full_command?: string[];
  focused_outer_command?: string[];
  focused_inner_command?: string[];
  inventory?: DoubleTddInventoryEntry[];
  selected_example?: string;
  criterion?: string;
  oracle?: string;
  high_value_test?: string;
  inner_responsibility?: string;
  inner_test?: string;
  red_proof?: string;
  failure_kind?: "plumbing" | "missing_behavior";
  handled?: boolean;
  acceptance_gap?: boolean;
  [key: string]: unknown;
}

const STATE_NAMES: ReadonlySet<string> = new Set([
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
]);

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function requireArgv(value: unknown, field: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty array`);
  }
  value.forEach((item) => requireNonEmptyString(item, field));
}

function requireInventory(value: unknown): void {
  if (!Array.isArray(value)) throw new Error("inventory must be an array");
  value.forEach((entry) => {
    const object = requireObject(entry, "inventory entry");
    requireNonEmptyString(object.path, "path");
    requireNonEmptyString(object.kind, "kind");
  });
}

/** Classifies paths that represent tests or acceptance specifications. */
export function isTestPath(path: string): boolean {
  return (
    /(^|\/)(features?|tests?)(\/|\.)/.test(path) ||
    /\.(test|spec)\.[^/]+$/.test(path)
  );
}

/** Validates the state-machine envelope required before each transition. */
export function validateOutputForState(
  state: DoubleTddStateName,
  output: unknown,
): DoubleTddOutput {
  if (!STATE_NAMES.has(state)) throw new Error(`Invalid state: ${state}`);
  const parsed = requireObject(output, "output");
  if (parsed.status !== "success") throw new Error('status must be "success"');
  const required = (
    field: string,
    validate: (value: unknown, field: string) => void,
  ) => {
    const value = parsed[field];
    if (value === undefined) throw new Error(`${field} is required`);
    validate(value, field);
  };
  if (state === "S0_SCOPE") {
    for (const field of [
      "acceptance_full_command",
      "unit_full_command",
      "focused_outer_command",
      "focused_inner_command",
    ])
      required(field, requireArgv);
    required("inventory", (value) => requireInventory(value));
  }
  if (state === "S1_SELECT_OUTER") {
    for (const field of ["selected_example", "criterion", "oracle"])
      required(field, requireNonEmptyString);
    if (parsed.acceptance_gap === true)
      required("artifacts", (value, field) => {
        if (!Array.isArray(value) || value.length === 0)
          throw new Error(`${field} must be a non-empty array`);
        value.forEach((item) => {
          if (typeof item !== "string")
            throw new Error(`${field} must contain strings`);
        });
      });
  }
  if (state === "S2_WRITE_OUTER") {
    required("high_value_test", requireNonEmptyString);
    required("focused_outer_command", requireArgv);
  }
  if (state === "S4_SELECT_INNER")
    required("inner_responsibility", requireNonEmptyString);
  if (state === "S5_INNER_RED") {
    required("inner_test", requireNonEmptyString);
    required("focused_inner_command", requireArgv);
  }
  if (state === "S10_COVERAGE") {
    required("handled", (value, field) => {
      if (typeof value !== "boolean")
        throw new Error(`${field} must be a boolean`);
    });
  }
  return parsed as DoubleTddOutput;
}
