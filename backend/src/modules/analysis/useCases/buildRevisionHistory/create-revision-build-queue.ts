import type {
  RevisionHistory,
  AnalysisSnapshot,
} from "../../revision-history.ts";
import type { RevisionBuilderWorkerClient } from "../../worker.ts";
import { buildAffectedRevisions } from "./build-affected-revisions.ts";

type Priority = "interactive" | "change" | "baseline";
interface Item {
  paths: string[];
  priority: Priority;
  resolve?: (snapshots: readonly AnalysisSnapshot[]) => void;
  reject?: (error: Error) => void;
}
export interface RevisionBuildQueueOptions {
  readonly retryDelaysMs?: readonly number[];
  readonly onReady?: (snapshot: AnalysisSnapshot) => void;
  readonly onFailure?: (paths: readonly string[], error: Error) => void;
  /** Injectable worker seam; production and tests may replace the client. */
  readonly workerClient?: RevisionBuilderWorkerClient;
  readonly debounceMs?: number;
}

/** A single prioritized, debounced revision-build path. */
export class RevisionBuildQueue {
  private readonly pending: Item[] = [];
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  private readonly folder: string;
  private readonly history: RevisionHistory;
  private readonly options: RevisionBuildQueueOptions;

  constructor(
    folder: string,
    history: RevisionHistory,
    options: RevisionBuildQueueOptions = {}
  ) {
    this.folder = folder;
    this.history = history;
    this.options = options;
  }

  enqueueAffected(
    paths: readonly string[],
    priority: "change" | "baseline" = "change"
  ): void {
    if (this.closed) {
      return;
    }
    const item: Item = {
      paths: [...new Set(paths)],
      priority,
    };
    const existing = this.pending.find(
      (candidate) => candidate.priority === priority
    );
    if (existing) {
      existing.paths.push(...item.paths);
      return;
    }
    this.pending.push(item);
    this.pending.sort(
      (a, b) =>
        RevisionBuildQueue.rank(b.priority) -
        RevisionBuildQueue.rank(a.priority)
    );
    this.schedule();
  }

  analyze(
    paths: readonly string[],
    priority: Priority = "interactive"
  ): Promise<readonly AnalysisSnapshot[]> {
    if (this.closed) {
      return Promise.reject(new Error("Revision build queue is closed"));
    }
    const deferred = Promise.withResolvers<readonly AnalysisSnapshot[]>();
    this.pending.push({
      paths: [...paths],
      priority,
      reject: deferred.reject,
      resolve: deferred.resolve,
    });
    this.pending.sort(
      (a, b) =>
        RevisionBuildQueue.rank(b.priority) -
        RevisionBuildQueue.rank(a.priority)
    );
    this.schedule();
    return deferred.promise;
  }

  close(): void {
    this.closed = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    const error = new Error("Revision build queue is closed");
    for (const item of this.pending) {
      item.reject?.(error);
    }
    this.pending.length = 0;
    void this.closeWorker();
  }

  private async closeWorker(): Promise<void> {
    try {
      await this.options.workerClient?.close?.();
    } catch (error) {
      this.options.onFailure?.(
        [],
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  private schedule(): void {
    if (!this.running && this.timer === undefined) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.drain();
      }, this.options.debounceMs ?? 0);
    }
  }
  private async drain(): Promise<void> {
    if (this.running || this.closed) {
      return;
    }
    const item = this.pending.shift();
    if (!item) {
      return;
    }
    this.running = true;
    try {
      const snapshots = await this.buildWithRetries(
        item,
        this.options.retryDelaysMs ?? [500, 2000]
      );
      item.resolve?.(snapshots);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.options.onFailure?.(item.paths, failure);
      item.reject?.(failure);
    } finally {
      this.running = false;
      this.schedule();
    }
  }

  private async buildWithRetries(
    item: Item,
    delays: readonly number[],
    attempt = 0
  ): Promise<readonly AnalysisSnapshot[]> {
    try {
      const result = await buildAffectedRevisions(
        this.folder,
        item.paths,
        this.history,
        undefined,
        this.options.onReady,
        this.options.workerClient
      );
      return result.snapshots;
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      const deferred = Promise.withResolvers<null>();
      setTimeout(() => deferred.resolve(null), delay);
      await deferred.promise;
      return this.buildWithRetries(item, delays, attempt + 1);
    }
  }
  private static rank(priority: Priority): number {
    if (priority === "interactive") {
      return 3;
    }
    if (priority === "change") {
      return 2;
    }
    return 1;
  }
}
