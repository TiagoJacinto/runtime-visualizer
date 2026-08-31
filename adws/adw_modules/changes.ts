import * as git from "./git_helper";
import { writeFileSync } from "node:fs";
import { ChangeCapture, ChangeSet, ChangesOutput, BaseRef } from "./data_types";

export function resolveBase(ref = "main", cwd = process.cwd()): BaseRef {
  if (!git.isRepo(cwd)) throw new Error("not a git repository — change capture needs one");
  if (!git.refExists(ref, cwd)) throw new Error(`base ref ${ref} does not exist`);
  const commit = git.mergeBase(ref, "HEAD", cwd);
  let baseCommit = commit;
  let reason = "";
  const label = ref;
  if (git.shortSha(commit, cwd) !== git.shortSha("HEAD", cwd))
    reason = `HEAD is ahead of ${label} — diffing every commit since, plus the working tree`;
  else if (git.isDirty(cwd)) reason = `HEAD is on ${label} — diffing the uncommitted working tree`;
  else if (git.refExists("HEAD~1", cwd)) {
    baseCommit = git.rev("HEAD~1", cwd);
    reason = `HEAD is on ${label} with a clean tree — falling back to the last commit`;
  } else reason = `HEAD is on ${label} with a clean tree and no parent commit`;
  return { ref, commit: baseCommit, reason, label };
}

export function capture(run: any, p: ChangeCapture = {}): ChangeSet {
  const base = resolveBase(p.base || "main", run.repoRoot);
  const files = git.diffFiles(base.commit, run.repoRoot);
  const untracked = p.includeUntracked === false ? [] : git.untrackedFiles(run.repoRoot);
  const [insertions, deletions] = git.diffCounts(base.commit, run.repoRoot);
  const stat = git.diffStat(base.commit, run.repoRoot);
  let text = git.diffText(base.commit, run.repoRoot);
  const lines = text.split("\n");
  const maxLines = p.maxDiffLines || 2000;
  const truncated = lines.length > maxLines;
  if (truncated)
    text = `${lines.slice(0, maxLines).join("\n")}\n\n[truncated at ${maxLines} lines of ${lines.length}]`;
  const path = `${run.contextHandoffDir}/changes.diff`;
  writeFileSync(
    path,
    `# changes since ${base.label} @ ${base.commit.slice(0, 7)}\n# ${base.reason}\n# +${insertions} -${deletions} across ${files.length} tracked file(s)\n\n## stat\n${stat || "  (no tracked changes)"}\n\n## untracked files\n${untracked.length ? untracked.map((x) => `  ${x}`).join("\n") : "  (none)"}\n\n## diff\n${text}\n`,
  );
  return {
    base,
    files,
    untracked,
    insertions,
    deletions,
    stat,
    diffPath: path,
    truncated,
  };
}

export function asEnvelope(c: ChangeSet, notes = ""): ChangesOutput {
  return {
    status: "success",
    summary: `${c.files.length + c.untracked.length} file(s) changed since ${c.base.label} (+${c.insertions} -${c.deletions})`,
    artifacts: [c.diffPath],
    notes_for_next_agent: notes,
    base: `${c.base.label} @ ${c.base.commit.slice(0, 7)} — ${c.base.reason}`,
    changed_files: [...c.files, ...c.untracked],
    insertions: c.insertions,
    deletions: c.deletions,
    stat: c.stat,
    diff_path: c.diffPath,
  };
}
