import { existsSync, statSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { EnvelopeBase, GateReport } from "./data_types";
const size = (p: string) => {
  const n = statSync(p).size;
  return n < 1024 ? `${n}B` : `${(n / 1024).toFixed(1)}KB`;
};
export function artifactsExist(e: EnvelopeBase) {
  const r = new GateReport();
  const artifacts = (e.artifacts || []) as string[];
  if (artifacts.length === 0) {
    r.check("artifacts", false, "agent did not declare an artifact");
    return r;
  }
  for (const a of artifacts)
    r.check(
      a,
      existsSync(a),
      existsSync(a) ? `exists, ${size(a)}` : "declared artifact does not exist",
    );
  return r;
}
export function filesNonEmpty(e: EnvelopeBase) {
  const r = new GateReport();
  for (const a of (e.artifacts || []) as string[])
    if (existsSync(a) && statSync(a).isFile())
      r.check(a, statSync(a).size > 0, statSync(a).size ? size(a) : "declared artifact is empty");
  return r;
}
export function jsonParses(e: EnvelopeBase) {
  const r = new GateReport();
  for (const a of (e.artifacts || []) as string[])
    if (a.endsWith(".json") && existsSync(a))
      try {
        r.check(a, true, `parses, ${typeof JSON.parse(readFileSync(a, "utf8"))}`);
      } catch (x) {
        r.check(a, false, `declared JSON artifact does not parse: ${x}`);
      }
  return r;
}
export function diffMatchesClaims(e: any) {
  const r = new GateReport();
  for (const f of e.changed_files || [])
    r.check(
      f,
      existsSync(f),
      existsSync(f) ? `exists, ${size(f)}` : "claimed changed file does not exist",
    );
  return r;
}
export function verdictConsistent(e: any) {
  const r = new GateReport(),
    blocking = e.blocking || [],
    unmet = (e.findings || []).filter((f: any) => !f.met);
  r.check(
    "approved vs blocking",
    !(e.approved && blocking.length),
    blocking.length
      ? `${blocking.length} blocking item(s)${e.approved ? " while approved=true" : " , not approved"}`
      : "no blocking items",
  );
  r.check(
    "approved vs findings",
    !(e.approved && unmet.length),
    unmet.length
      ? `${unmet.length} unmet requirement(s)${e.approved ? " while approved=true" : " , not approved"}`
      : "every requirement met",
  );
  r.check(
    "rejection names a problem",
    !!e.approved || !!(blocking.length || unmet.length),
    e.approved
      ? "verdict is supported"
      : "approved=false but no blocking item or unmet requirement was given",
  );
  return r;
}
export function testsPass(command: string) {
  const g = (_e: EnvelopeBase) => {
    const r = spawnSync("sh", ["-c", command], { encoding: "utf8" }),
      ok = r.status === 0;
    return new GateReport().check(
      command,
      ok,
      `exit ${r.status}${ok ? "" : "\n" + (r.stdout + r.stderr).slice(-1000)}`,
    );
  };
  Object.defineProperty(g, "name", { value: `tests_pass(${command})` });
  return g;
}
