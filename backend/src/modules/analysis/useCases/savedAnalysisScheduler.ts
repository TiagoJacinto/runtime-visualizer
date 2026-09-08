import type { ProcedureScope } from "../../../../../packages/contracts/src/index.ts";
export type AnalysisPriority = "interactive" | "change" | "baseline";
import type { AnalysisSnapshot, RevisionHistory } from "../revisionHistory.ts";
import { RevisionBuildQueue } from "./buildRevisionHistory/createRevisionBuildQueue.ts";

export type SavedAnalysisSchedulerOptions = {
    readonly queue?: RevisionBuildQueue;
    readonly analyze?: (scope: ProcedureScope) => Promise<AnalysisSnapshot>;
};

/** The single seam for foreground and background saved analysis. */
export interface SavedAnalysisScheduler {
    analyze(
        scope: ProcedureScope,
        priority?: AnalysisPriority,
    ): Promise<AnalysisSnapshot>;
    enqueueAffected(
        paths: readonly string[],
        priority?: "change" | "baseline",
    ): void;
    close(): void;
}

export function createSavedAnalysisScheduler(
    filesFolder: string,
    history: RevisionHistory,
    options: SavedAnalysisSchedulerOptions = {},
): SavedAnalysisScheduler {
    const queue = options.queue ?? new RevisionBuildQueue(filesFolder, history);
    const pending = new Map<string, Promise<AnalysisSnapshot>>();
    return {
        analyze(scope, priority = "interactive") {
            const key = `${scope.file}\0${scope.procedureId}`;
            const existing = pending.get(key);
            if (existing) return existing;
            const task = options.analyze
                ? options.analyze(scope)
                : queue.analyze([scope.file], priority).then((snapshots) => {
                      const snapshot = snapshots.find(
                          (item: AnalysisSnapshot) =>
                              item.file === scope.file &&
                              item.procedure.id === scope.procedureId,
                      );
                      if (!snapshot) throw new Error("Procedure unavailable");
                      return snapshot;
                  });
            pending.set(key, task);
            return task.finally(() => pending.delete(key));
        },
        enqueueAffected(paths, priority = "change") {
            queue.enqueueAffected(paths, priority);
        },
        close() {
            queue.close();
        },
    };
}
