import { buildAffectedRevisions } from "./buildAffectedRevisions.ts";
import type {
  RevisionHistory,
  AnalysisSnapshot,
} from "../../revisionHistory.ts";
import type { RevisionBuilderWorkerClient } from "../../infra/revisionBuilderWorkerClient.ts";

type Priority = "interactive" | "change" | "baseline";
type Item = {
  paths: readonly string[];
  priority: Priority;
  resolve: (snapshots: readonly AnalysisSnapshot[]) => void;
  reject: (error: unknown) => void;
};
export type RevisionBuildQueueOptions = {
  readonly retryDelaysMs?: readonly number[];
  readonly onReady?: (snapshot: AnalysisSnapshot) => void;
  readonly onFailure?: (paths: readonly string[], error: Error) => void;
  /** Injectable worker seam; production and tests may replace the client. */
  readonly workerClient?: RevisionBuilderWorkerClient;
  readonly debounceMs?: number;
};

/** A single prioritized, debounced revision-build path. */
export class RevisionBuildQueue {
  private readonly pending: Item[] = [];
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  constructor(
    private readonly folder: string,
    private readonly history: RevisionHistory,
    private readonly options: RevisionBuildQueueOptions = {},
  ) {}

  enqueueAffected(
    paths: readonly string[],
    priority: "change" | "baseline" = "change",
  ): void {
    if (this.closed) return;
    const item: Item = {
      paths: [...new Set(paths)],
      priority,
      resolve: () => {},
      reject: () => {},
    };
    const existing = this.pending.find(
      (candidate) => candidate.priority === priority,
    );
    if (existing) {
      (existing.paths as string[]).push(...item.paths);
      return;
    }
    this.pending.push(item);
    this.pending.sort((a, b) => this.rank(b.priority) - this.rank(a.priority));
    this.schedule();
  }

  analyze(
    paths: readonly string[],
    priority: Priority = "interactive",
  ): Promise<readonly AnalysisSnapshot[]> {
    if (this.closed)
      return Promise.reject(new Error("Revision build queue is closed"));
    return new Promise((resolve, reject) => {
      this.pending.push({ paths: [...paths], priority, resolve, reject });
      this.pending.sort(
        (a, b) => this.rank(b.priority) - this.rank(a.priority),
      );
      this.schedule();
    });
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    for (const item of this.pending)
      item.reject(new Error("Revision build queue is closed"));
    this.pending.length = 0;
    void this.options.workerClient?.close?.();
  }
  private schedule(): void {
    if (!this.running && this.timer === undefined)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.drain();
      }, this.options.debounceMs ?? 0);
  }
  private async drain(): Promise<void> {
    if (this.running || this.closed) return;
    const item = this.pending.shift();
    if (!item) return;
    this.running = true;
    const delays = this.options.retryDelaysMs ?? [500, 2000];
    let last: unknown;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const result = await buildAffectedRevisions(
          this.folder,
          item.paths,
          this.history,
          undefined,
          this.options.onReady,
          this.options.workerClient,
        );
        item.resolve(result.snapshots);
        this.running = false;
        this.schedule();
        return;
      } catch (error) {
        last = error;
        const delay = delays[attempt];
        if (delay === undefined) break;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    this.options.onFailure?.(
      item.paths,
      last instanceof Error ? last : new Error(String(last)),
    );
    item.reject(last);
    this.running = false;
    this.schedule();
  }
  private rank(priority: Priority): number {
    return priority === "interactive" ? 3 : priority === "change" ? 2 : 1;
  }
}
