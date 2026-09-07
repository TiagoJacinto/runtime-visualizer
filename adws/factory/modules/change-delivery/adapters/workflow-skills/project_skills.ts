import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileSkill } from "../../../factory-distribution/skill-compilation";

/** Loads and compiles a change-delivery workflow skill from the operator repository. */
export function compileWorkflowSkill(
  name: string,
  variables: Readonly<Record<string, string>> = {},
  root = process.cwd(),
): string {
  const installedPath = resolve(
    root,
    "adws",
    "adw_data",
    "workflow_skills",
    name,
    "SKILL.md",
  );
  const sourcePath = resolve(root, "src", "skills", name, "SKILL.md");
  const path = existsSync(installedPath) ? installedPath : sourcePath;
  try {
    return compileSkill(readFileSync(path, "utf8"), {
      target: "workflow",
      variables,
    });
  } catch (error) {
    throw new Error(
      `Cannot compile workflow skill ${name} at ${path}: ${String(error)}`,
    );
  }
}
