import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { AgentConfig } from "./data_types";
import { operatorEnv } from "./utils";

export class PermissionBreach extends Error {}
const GIT_TIMEOUT_MS = 30_000;
function git(args: string[], cwd: string) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    env: operatorEnv(),
  });
}
function snapshotGit(args: string[], cwd: string) {
  const result = git(args, cwd);
  return result.status === 0 ? result.stdout || "" : "";
}
export function snapshot(run: any) {
  const out: Record<string, string> = {};
  for (const line of snapshotGit(["diff", "HEAD", "--numstat"], run.repoRoot).split("\n")) {
    const fields = line.split("\t");
    if (fields.length >= 3) out[fields.at(-1)!.trim()] = `${fields[0]},${fields[1]}`;
  }
  for (const path of snapshotGit(["ls-files", "--others", "--exclude-standard"], run.repoRoot)
    .split("\n")
    .filter(Boolean))
    out[path.trim()] = "untracked";
  return out;
}
export function changedPaths(a: Record<string, string>, b: Record<string, string>) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((path) => a[path] !== b[path])
    .sort();
}
function matches(path: string, pattern: string) {
  if (pattern.endsWith("/")) return path.startsWith(pattern);
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "§")
    .replaceAll("*", "[^/]*")
    .replaceAll("?", "[^/]")
    .replaceAll("§", ".*");
  return pattern.includes("*") || pattern.includes("?")
    ? new RegExp(`^${escaped}$`).test(path)
    : path === pattern;
}
export function alwaysWritable(run: any, path: string) {
  return path.startsWith(`${run.cfg.defaults.data_dir}/`);
}
function rollbackPath(run: any, path: string) {
  const tracked = git(["ls-files", "--error-unmatch", "--", path], run.repoRoot).status === 0;
  if (tracked) {
    const reset = git(["reset", "HEAD", "--", path], run.repoRoot);
    if (reset.status !== 0)
      throw new PermissionBreach(
        `failed to unstage unauthorized path ${path}: ${(reset.stderr || "").trim()}`,
      );
    const stillTracked =
      git(["ls-files", "--error-unmatch", "--", path], run.repoRoot).status === 0;
    if (stillTracked) {
      const restore = git(["checkout", "--", path], run.repoRoot);
      if (restore.status !== 0)
        throw new PermissionBreach(
          `failed to restore unauthorized path ${path}: ${(restore.stderr || "").trim()}`,
        );
    } else if (existsSync(`${run.repoRoot}/${path}`))
      rmSync(`${run.repoRoot}/${path}`, { recursive: true, force: true });
  } else if (existsSync(`${run.repoRoot}/${path}`))
    rmSync(`${run.repoRoot}/${path}`, { recursive: true, force: true });
}
export function enforce(
  run: any,
  before: Record<string, string>,
  agent: AgentConfig,
  _envelope: any,
) {
  const after = snapshot(run);
  const paths = changedPaths(before, after);
  const allowed = agent.writes;
  const protectedFiles = run.cfg.defaults.protected_files || [];
  const bad = paths.filter((path) => {
    if (alwaysWritable(run, path)) return false;
    if (
      allowed !== null &&
      allowed !== undefined &&
      !allowed.some((pattern: string) => matches(path, pattern))
    )
      return true;
    if (
      protectedFiles.some((pattern: string) => matches(path, pattern)) &&
      !(allowed || []).some((pattern: string) => matches(path, pattern))
    )
      return true;
    return false;
  });
  if (bad.length) {
    for (const path of bad) if (!before[path]) rollbackPath(run, path);
    throw new PermissionBreach(`agent ${agent.name} changed unauthorized paths: ${bad.join(", ")}`);
  }
}
