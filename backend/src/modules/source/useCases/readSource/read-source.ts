import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";

import { HttpError } from "../../../../shared/index.ts";
import type { SourceResource } from "../../types.ts";

export const sourceRevision = (source: string): string =>
  createHash("sha256").update(source).digest("hex");
/** Resolve an API file name while keeping it inside the configured folder. */
export const resolveSourcePath = (
  filesFolder: string,
  requestedFile: string
): string => {
  const file = requestedFile.split("\\").join("/");
  const segments = file.split("/");
  if (
    file.length === 0 ||
    path.isAbsolute(file) ||
    /^[A-Za-z]:\//u.test(file) ||
    segments.some((segment: string) => segment === "..")
  ) {
    throw new HttpError(
      400,
      "Source path must stay inside the configured files folder."
    );
  }
  const root = path.resolve(filesFolder);
  const candidate = path.resolve(root, file);
  const relative = path.relative(root, candidate);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new HttpError(
      400,
      "Source path must stay inside the configured files folder."
    );
  }
  return candidate;
};
export const canonicalSourceFile = (
  filesFolder: string,
  requestedFile: string
): string => {
  const candidate = resolveSourcePath(filesFolder, requestedFile);
  return path
    .relative(path.resolve(filesFolder), candidate)
    .split(path.sep)
    .join("/");
};
export const readSource = async (
  filesFolder: string,
  requestedFile: string
): Promise<SourceResource> => {
  const file = canonicalSourceFile(filesFolder, requestedFile);
  const absolute = resolveSourcePath(filesFolder, file);
  const root = await fs.realpath(filesFolder).catch((error) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  });
  if (root === undefined) {
    throw new HttpError(404, "Source file not found.");
  }
  let realFile: string;
  try {
    realFile = await fs.realpath(absolute);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new HttpError(404, "Source file not found.");
    }
    throw error;
  }
  const relativeRealFile = path.relative(root, realFile);
  if (
    relativeRealFile === ".." ||
    relativeRealFile.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeRealFile)
  ) {
    throw new HttpError(
      400,
      "Source path must stay inside the configured files folder."
    );
  }
  const entry = await fs.lstat(absolute);
  if (!entry.isFile() || entry.isSymbolicLink()) {
    throw new HttpError(404, "Source file not found.");
  }
  const source = await fs.readFile(absolute, "utf-8");
  return { file, revision: sourceRevision(source), source };
};
