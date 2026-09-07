import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { SourceState } from "../../ports/workspace";
import type { WorkspaceLease, WorkspacePort } from "../../ports/workspace";

function git(args: string[], cwd: string): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: Object.fromEntries(
      ["HOME", "LANG", "LC_ALL", "PATH", "TMPDIR", "USER"].flatMap((key) => {
        const value = process.env[key];
        return value === undefined ? [] : [[key, value]];
      }),
    ),
  }).trim();
}

export class GitWorkspaceAdapter implements WorkspacePort {
  inspect(repository: string): SourceState {
    return {
      repository,
      revision: git(["rev-parse", "HEAD"], repository),
      workingTree: git(["status", "--porcelain"], repository)
        ? "Dirty"
        : "Clean",
    };
  }

  create(
    repository: string,
    destination: string,
    expectedRevision: string,
  ): WorkspaceLease {
    const before = this.inspect(repository);
    if (before.workingTree !== "Clean")
      throw new Error("source preflight failed: working tree is dirty");
    if (before.revision !== expectedRevision) {
      throw new Error(
        `source preflight failed: expected ${expectedRevision}, found ${before.revision}`,
      );
    }
    mkdirSync(dirname(destination), { recursive: true });
    if (existsSync(destination))
      rmSync(destination, { recursive: true, force: true });
    execFileSync(
      "git",
      ["clone", "--quiet", "--no-hardlinks", repository, destination],
      {
        encoding: "utf8",
      },
    );
    const after = this.inspect(repository);
    if (after.workingTree !== "Clean" || after.revision !== before.revision) {
      rmSync(destination, { recursive: true, force: true });
      throw new Error(
        "source preflight failed: source changed during workspace creation",
      );
    }
    let retained = false;
    return {
      path: destination,
      source: before,
      isolation: "IndependentClone",
      retain: () => {
        retained = true;
      },
      dispose: () => {
        if (!retained) rmSync(destination, { recursive: true, force: true });
      },
    };
  }
}
