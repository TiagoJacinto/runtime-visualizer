import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileSkill } from "./skill_compiler";

export function compileWorkflowSkill(
  name: string,
  variables: Readonly<Record<string, string>> = {},
  root = process.cwd(),
): string {
  const path = resolve(root, "adws", "adw_data", "workflow_skills", name, "SKILL.md");
  try {
    return compileSkill(readFileSync(path, "utf8"), { target: "workflow", variables });
  } catch (error) {
    throw new Error(`Cannot compile workflow skill ${name} at ${path}: ${String(error)}`);
  }
}
