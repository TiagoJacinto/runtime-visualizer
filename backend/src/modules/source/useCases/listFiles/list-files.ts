import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";

const walk =
  /**
   * Recursively walks `abs` and returns every regular file as a
   * forward-slash path relative to `rel`. Symlinks and any dot-prefixed
   * directory are skipped — symlinks to keep the listing predictable
   * (and to prevent walking out of the configured folder), dot-dirs because
   * they conventionally hold tool output that shouldn't be exposed as
   * user-editable source files.
   *
   * Results are sorted by their relative forward-slash path so callers
   * receive one stable order independent of filesystem directory order.
   */
  async (abs: string, rel: string): Promise<string[]> => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch (error) {
      // Missing dir mid-walk (e.g. deleted between reads): skip the
      // subtree rather than failing the whole request.
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }
      throw error;
    }
    entries = entries.toSorted((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    const children = await Promise.all(
      entries.map((entry) => {
        if (entry.isSymbolicLink()) {
          return [];
        }
        if (entry.isDirectory() && entry.name.startsWith(".")) {
          return [];
        }
        const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
        if (entry.isDirectory()) {
          return walk(path.join(abs, entry.name), childRel);
        }
        return entry.isFile() ? [childRel] : [];
      })
    );
    return children.flat().toSorted((left, right) => left.localeCompare(right));
  };
export const isSourceFile = (file: string): boolean =>
  /\.(?:ts|tsx)$/iu.test(file);
export const listSourceFiles = (folder: string): Promise<string[]> =>
  walk(folder, "");
