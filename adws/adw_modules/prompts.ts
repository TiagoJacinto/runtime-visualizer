import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
export function render(path: string, vars: Record<string, string>) {
  let text = readFileSync(path, "utf8");
  for (const [k, v] of Object.entries(vars)) text = text.split(`{{${k}}}`).join(v);
  return text;
}
export function save(dir: string, name: string, content: string) {
  mkdirSync(dir, { recursive: true });
  const p = `${dir}/${name}`;
  writeFileSync(p, content);
  return p;
}
