import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";
import { enforce, snapshot, PermissionBreach } from "../process-runtime";

test("rolls back unauthorized workspace writes", () => {
  const root = mkdtempSync(join(tmpdir(), "permission-"));
  execFileSync("git", ["init", "--quiet", root]);
  writeFileSync(join(root, "README.md"), "clean");
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", [
    "-C",
    root,
    "-c",
    "user.email=test@example.com",
    "-c",
    "user.name=test",
    "commit",
    "--quiet",
    "-m",
    "init",
  ]);
  const before = snapshot({ repoRoot: root });
  writeFileSync(join(root, "forbidden.txt"), "secret");
  expect(() =>
    enforce(
      {
        repoRoot: root,
        cfg: {
          defaults: { data_dir: join(root, "data"), protected_files: [] },
        },
      },
      before,
      { name: "planner", writes: ["allowed.txt"] },
      {},
    ),
  ).toThrow(PermissionBreach);
  expect(existsSync(join(root, "forbidden.txt"))).toBe(false);
});
