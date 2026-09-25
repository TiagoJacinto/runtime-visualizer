/* oxlint-disable avoid-new, prefer-add-event-listener, class-methods-use-this */

import type { RevisionSummary } from "@runtime-visualizer/contracts";
import { openBrowserWorkspaceDatabase } from "../browser-storage/indexed-db.ts";
import type { AnalysisSnapshot, RevisionKey } from "../analysis/index.ts";

interface StoredSnapshot extends Omit<AnalysisSnapshot, "files"> {
  readonly fileHashes: Readonly<Record<string, string>>;
}

interface StoredSource {
  readonly hash: string;
  readonly text: string;
}

const SOURCES = "sources";
const REVISIONS = "revisions";

const hash = async (text: string): Promise<string> => {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("Revision history requires a secure browser context.");
  }
  const result = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(result)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const requestValue = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("Revision storage request failed.")));
  });

export class IndexedDbRevisionHistory {
  async save(snapshot: AnalysisSnapshot): Promise<"inserted" | "existing"> {
    const sourceRecords = await Promise.all(
      Object.entries(snapshot.files).map(async ([file, text]) => ({
        file,
        hash: await hash(text),
        text,
      }))
    );
    const fileHashes = Object.fromEntries(
      sourceRecords.map(({ file, hash: sourceHash }) => [file, sourceHash])
    );
    const database = await openBrowserWorkspaceDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([SOURCES, REVISIONS], "readwrite");
      const revisions = transaction.objectStore(REVISIONS);
      const key = [snapshot.projectId, snapshot.file, snapshot.procedureId, snapshot.revision];
      let outcome: "inserted" | "existing" = "inserted";
      const lookup = revisions.get(key);
      lookup.addEventListener("success", () => {
        if (lookup.result !== undefined) {
          outcome = "existing";
          return;
        }
        const sourceStore = transaction.objectStore(SOURCES);
        for (const { hash: sourceHash, text } of sourceRecords) {
          sourceStore.put({ hash: sourceHash, text } satisfies StoredSource);
        }
        const { files: _files, ...metadata } = snapshot;
        revisions.put({ ...metadata, fileHashes } satisfies StoredSnapshot);
      });
      transaction.addEventListener("complete", () => {
        database.close();
        resolve(outcome);
      });
      transaction.addEventListener("error", () => {
        database.close();
        reject(transaction.error ?? new Error("Unable to save revision."));
      });
      transaction.addEventListener("abort", () => {
        database.close();
        reject(transaction.error ?? new Error("Revision save aborted."));
      });
    });
  }

  async load(key: RevisionKey): Promise<AnalysisSnapshot | undefined> {
    const database = await openBrowserWorkspaceDatabase();
    try {
      const transaction = database.transaction([SOURCES, REVISIONS], "readonly");
      // SAFETY: save() writes each revision key using the StoredSnapshot shape.
      const stored = (await requestValue(
        transaction
          .objectStore(REVISIONS)
          .get([key.projectId, key.file, key.procedureId, key.revision])
      )) as StoredSnapshot | undefined;
      if (stored === undefined) {
        return undefined;
      }
      const files = Object.fromEntries(
        await Promise.all(
          Object.entries(stored.fileHashes).map(async ([file, sourceHash]) => {
            // SAFETY: save() writes source records using the StoredSource shape.
            const source = (await requestValue(
              transaction.objectStore(SOURCES).get(sourceHash)
            )) as StoredSource | undefined;
            if (source === undefined) {
              throw new Error(`Revision source content is missing: ${file}`);
            }
            return [file, source.text] as const;
          })
        )
      );
      const { fileHashes: _fileHashes, ...metadata } = stored;
      return { ...metadata, files };
    } finally {
      database.close();
    }
  }

  async list(
    scope: Pick<RevisionKey, "projectId" | "file" | "procedureId">
  ): Promise<readonly RevisionSummary[]> {
    const database = await openBrowserWorkspaceDatabase();
    try {
      // SAFETY: all revision records are written by save() using StoredSnapshot.
      const records = (await requestValue(
        database.transaction(REVISIONS, "readonly").objectStore(REVISIONS).getAll()
      )) as StoredSnapshot[];
      return records
        .filter(
          (record) =>
            record.projectId === scope.projectId &&
            record.file === scope.file &&
            record.procedureId === scope.procedureId
        )
        .map((record) =>
          ({
            analyzedAt: record.analyzedAt,
            diagnosticCount: record.diagnostics.length,
            file: record.file,
            procedureId: record.procedureId,
            projectId: record.projectId,
            revision: record.revision,
            runnable: record.cfg !== null && record.diagnostics.length === 0,
          })
        )
        .toSorted((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
    } finally {
      database.close();
    }
  }
}
