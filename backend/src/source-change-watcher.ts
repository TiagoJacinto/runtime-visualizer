import { listSourceFiles } from "./routes/files.ts";
import { readSource } from "./source-resources.ts";

type FileState = { readonly revision: string };
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
		private readonly intervalMs = 100,
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

	private async refresh(): Promise<void> {
		if (this.polling) return;
		this.polling = true;
		try {
			const files = await listSourceFiles(this.filesFolder);
			const current = new Map<string, FileState>();
			for (const file of files) {
				try {
					const resource = await readSource(this.filesFolder, file);
					current.set(file, { revision: resource.revision });
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
		for (const subscriber of this.subscribers) subscriber(event);
	}
}
