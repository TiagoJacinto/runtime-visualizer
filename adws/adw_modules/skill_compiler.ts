export type SkillTarget = "project" | "workflow";

export interface CompileSkillOptions {
  target: SkillTarget;
  variables?: Readonly<Record<string, string>>;
}

const conditionalBlock = /<!-- @if target=(project|workflow) -->\n([\s\S]*?)<!-- @endif -->\n?/g;
const placeholder = /{{([A-Za-z][A-Za-z0-9_]*)}}/g;

/** Compile canonical skill text for its project or workflow consumer. */
export function compileSkill(source: string, options: CompileSkillOptions): string {
  const conditioned = source.replace(
    conditionalBlock,
    (_match, target: SkillTarget, content: string) => (target === options.target ? content : ""),
  );
  if (conditioned.includes("<!-- @if") || conditioned.includes("<!-- @endif -->")) {
    throw new Error("Malformed skill conditional block");
  }
  return conditioned.replace(placeholder, (_match, name: string) => {
    const value = options.variables?.[name];
    if (value === undefined) throw new Error(`Missing skill variable: ${name}`);
    return value;
  });
}
