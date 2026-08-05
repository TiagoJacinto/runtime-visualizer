import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isSourceFile, listSourceFiles } from "./routes/files.ts";
import { readSource } from "./source-resources.ts";

type FileState = {
	readonly revision: string;
	readonly mtimeMs: number;
	readonly size: number;
};
export type SourceChange = {
	readonly type: "file-changed";
	readonly file: string;
	readonly change: "added" | "modified" | "deleted";
	readonly revision?: string;
};
type SourceChangePayload = Omit<SourceChange, "type">;
type Subscriber = (change: SourceChange) => void;

export class SourceChangeWatcher {
	private readonly subscribers = new Set<Subscriber>();
	private previous = new Map<string, FileState>();
	private timer: ReturnType<typeof setInterval> | undefined;
	private polling = false;
	private initialized = false;

	constructor(
		private readonly filesFolder: string,
		private readonly intervalMs = 250,
	) {}

	subscribe(subscriber: Subscriber): () => void {
		this.subscribers.add(subscriber);
		if (this.timer === undefined) {
			void this.refresh();
			this.timer = setInterval(() => void this.refresh(), this.intervalMs);
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
		if (this.timer !== undefined) clearInterval(this.timer);
		this.timer = undefined;
	}

	async refresh(): Promise<void> {
		if (this.polling) return;
		this.polling = true;
		try {
			const files = (await listSourceFiles(this.filesFolder)).filter(
				isSourceFile,
			);
			const current = new Map<string, FileState>();
			for (const file of files) {
				try {
					const stat = await fs.stat(path.join(this.filesFolder, file));
					const oldState = this.previous.get(file);
					if (
						oldState !== undefined &&
						oldState.mtimeMs === stat.mtimeMs &&
						oldState.size === stat.size
					) {
						current.set(file, oldState);
						continue;
					}
					const resource = await readSource(this.filesFolder, file);
					current.set(file, {
						revision: resource.revision,
						mtimeMs: stat.mtimeMs,
						size: stat.size,
					});
				} catch {
					// A file can disappear between listing and reading.
				}
			}
			if (this.initialized) {
				for (const [file, state] of current) {
					const oldState = this.previous.get(file);
					if (oldState === undefined)
						this.publish({ file, change: "added", revision: state.revision });
					else if (oldState.revision !== state.revision)
						this.publish({
							file,
							change: "modified",
							revision: state.revision,
						});
				}
				for (const file of this.previous.keys()) {
					if (!current.has(file)) this.publish({ file, change: "deleted" });
				}
			}
			this.previous = current;
			this.initialized = true;
		} finally {
			this.polling = false;
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
