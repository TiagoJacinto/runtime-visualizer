import { describe, expect, test } from "vitest";
import { isTestPath, validateOutputForState } from "../double-tdd-state";

describe("double-loop TDD state validation", () => {
  test("recognises acceptance and unit test paths", () => {
    expect(isTestPath("tests/acceptance/create-user.feature")).toBe(true);
    expect(isTestPath("src/users/create-user.test.ts")).toBe(true);
    expect(isTestPath("src/users/create-user.ts")).toBe(false);
  });

  test("requires the scope commands and inventory", () => {
    expect(() =>
      validateOutputForState("S0_SCOPE", { status: "success" }),
    ).toThrow("acceptance_full_command");
    expect(
      validateOutputForState("S0_SCOPE", {
        status: "success",
        acceptance_full_command: ["bun", "run", "acceptance"],
        unit_full_command: ["bun", "test"],
        focused_outer_command: ["bun", "test", "outer"],
        focused_inner_command: ["bun", "test", "inner"],
        inventory: [],
      }).inventory,
    ).toEqual([]);
  });

  test("does not accept coverage without a handled decision", () => {
    expect(() =>
      validateOutputForState("S10_COVERAGE", { status: "success" }),
    ).toThrow("handled");
    expect(
      validateOutputForState("S10_COVERAGE", {
        status: "success",
        handled: true,
      }).handled,
    ).toBe(true);
  });
});
