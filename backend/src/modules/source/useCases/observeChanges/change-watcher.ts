import * as fs from "node:fs/promises";
import path from "node:path";

import { isSourceFile, listSourceFiles } from "../listFiles/list-files.ts";
import { readSource } from "../readSource/read-source.ts";

interface FileState {
  readonly revision: string;
  readonly mtimeMs: number;
  readonly size: number;
}
export interface SourceChange {
  readonly type: "file-changed";
  readonly file: string;
  readonly change: "added" | "modified" | "deleted";
  readonly revision?: string;
}
type SourceChangePayload = Omit<SourceChange, "type">;
type Subscriber = (change: SourceChange) => void;

export class SourceChangeWatcher {
  private readonly filesFolder: string;
  private initialized = false;
  private readonly intervalMs: number;
  private readonly subscribers = new Set<Subscriber>();
  private previous = new Map<string, FileState>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private polling = false;

  constructor(filesFolder: string, intervalMs = 250) {
    this.filesFolder = filesFolder;
    this.intervalMs = intervalMs;
  }

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    if (this.timer === undefined) {
      this.refreshInBackground();
      this.timer = setInterval(() => {
        this.refreshInBackground();
      }, this.intervalMs);
    }
    return () => {
      this.subscribers.delete(subscriber);
      if (this.subscribers.size === 0 && this.timer !== undefined) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    };
  }

  close(): void {
    this.subscribers.clear();
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
    this.timer = undefined;
  }

  async refresh(): Promise<void> {
    if (this.polling) {
      return;
    }
    this.polling = true;
    try {
      const files = await listSourceFiles(this.filesFolder);
      const sourceFiles = files.filter(isSourceFile);
      const results = await Promise.all(
        sourceFiles.map(async (file) => {
          try {
            const stat = await fs.stat(path.join(this.filesFolder, file));
            const oldState = this.previous.get(file);
            if (
              oldState !== undefined &&
              oldState.mtimeMs === stat.mtimeMs &&
              oldState.size === stat.size
            ) {
              return { file, state: oldState };
            }
            const resource = await readSource(this.filesFolder, file);
            return {
              file,
              state: {
                mtimeMs: stat.mtimeMs,
                revision: resource.revision,
                size: stat.size,
              },
            };
          } catch {
            // A file can disappear between listing and reading.
            return null;
          }
        })
      );
      const states = results.filter(
        (entry): entry is { file: string; state: FileState } => entry !== null
      );
      const current = new Map(
        states.map(({ file, state }) => [file, state] as const)
      );
      if (this.initialized) {
        for (const [file, state] of current) {
          const oldState = this.previous.get(file);
          if (oldState === undefined) {
            this.publish({ change: "added", file, revision: state.revision });
          } else if (oldState.revision !== state.revision) {
            this.publish({
              change: "modified",
              file,
              revision: state.revision,
            });
          }
        }
        for (const file of this.previous.keys()) {
          if (!current.has(file)) {
            this.publish({ change: "deleted", file });
          }
        }
      }
      this.previous = current;
      this.initialized = true;
    } finally {
      this.polling = false;
    }
  }

  private async refreshInBackground(): Promise<void> {
    try {
      await this.refresh();
    } catch {
      // Refresh failures are retried on the next polling interval.
    }
  }

  private publish(change: SourceChangePayload): void {
    const event: SourceChange = { type: "file-changed", ...change };
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch {
        this.subscribers.delete(subscriber);
      }
    }
  }
}
