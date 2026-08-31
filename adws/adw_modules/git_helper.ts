import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { operatorEnv } from "./utils";

const GIT_TIMEOUT_MS = 180_000;

function git(args: string[], cwd = process.cwd()) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    env: operatorEnv(),
  });
  if (result.status !== 0) {
    const reason = result.error?.message || (result.stderr || "").trim() || `exit ${result.status}`;
    throw new Error(`git ${args.join(" ")} failed: ${reason}`);
  }
  return (result.stdout || "").trim();
}

export interface SourceState {
  path: string;
  revision: string;
  workingTree: "Clean" | "Dirty";
}

export function isRepo(cwd = process.cwd()) {
  return (
    spawnSync("git", ["rev-parse", "--git-dir"], {
      cwd,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      env: operatorEnv(),
    }).status === 0
  );
}

export function repoRoot(cwd = process.cwd()) {
  return isRepo(cwd) ? resolve(git(["rev-parse", "--show-toplevel"], cwd)) : resolve(cwd);
}

export function inspectSource(path: string): SourceState {
  const revision = git(["rev-parse", "HEAD"], path);
  const workingTree = git(["status", "--porcelain"], path) ? "Dirty" : "Clean";
  return { path, revision, workingTree };
}

export function cloneRepository(source: string, destination: string) {
  git(["clone", "--quiet", "--no-hardlinks", source, destination]);
  return destination;
}

export function currentBranch(cwd = process.cwd()) {
  return git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
}
export function rev(ref = "HEAD", cwd = process.cwd()) {
  return git(["rev-parse", ref], cwd);
}
export function shortSha(ref = "HEAD", cwd = process.cwd()) {
  return git(["rev-parse", "--short", ref], cwd);
}
export function refExists(ref: string, cwd = process.cwd()) {
  return (
    spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
      cwd,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      env: operatorEnv(),
    }).status === 0
  );
}
export function mergeBase(ref: string, other = "HEAD", cwd = process.cwd()) {
  return git(["merge-base", ref, other], cwd);
}
export function isDirty(cwd = process.cwd()) {
  return !!git(["status", "--porcelain"], cwd);
}
export function untrackedFiles(cwd = process.cwd()) {
  return git(["ls-files", "--others", "--exclude-standard"], cwd).split("\n").filter(Boolean);
}
export function diffFiles(base: string, cwd = process.cwd()) {
  return git(["diff", "--name-only", base], cwd).split("\n").filter(Boolean);
}
export function diffStat(base: string, cwd = process.cwd()) {
  return git(["diff", "--stat", base], cwd);
}
export function diffText(base: string, cwd = process.cwd()) {
  return git(["diff", base], cwd);
}
export function diffCounts(base: string, cwd = process.cwd()) {
  let additions = 0;
  let deletions = 0;
  for (const line of git(["diff", "--numstat", base], cwd).split("\n")) {
    const [a, d] = line.split("\t");
    if (/^\d+$/.test(a || "")) additions += +a;
    if (/^\d+$/.test(d || "")) deletions += +d;
  }
  return [additions, deletions] as const;
}
export function changedFiles(cwd = process.cwd()) {
  return git(["status", "--porcelain"], cwd)
    .split("\n")
    .filter(Boolean)
    .map((x) => x.slice(3));
}
export function commitAll(message: string, cwd = process.cwd()) {
  if (!isRepo(cwd)) throw new Error("not a git repository — a commit phase needs one");
  git(["add", "-A"], cwd);
  if (!git(["status", "--porcelain"], cwd))
    throw new Error("nothing to commit — preceding phases changed no files");
  git(["commit", "-m", message], cwd);
  return shortSha("HEAD", cwd);
}
