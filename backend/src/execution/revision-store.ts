import type { ProcedureCfg } from "../cfg/types.ts";

export type RevisionSnapshot = {
	readonly source: string;
	readonly filePath: string;
	readonly functionName: string | undefined;
	readonly files: Record<string, string>;
	readonly procedure: ProcedureCfg;
};

type StoredSnapshot = {
	readonly snapshot: RevisionSnapshot;
	readonly createdAt: number;
};

export class RevisionStore {
	private readonly snapshots = new Map<string, StoredSnapshot>();

	constructor(
		private readonly maxEntries = 100,
		private readonly maxAgeMs = 5 * 60 * 1000,
		private readonly now = (): number => Date.now(),
	) {}

	private key(
		filePath: string,
		functionName: string | undefined,
		revision: string,
	): string {
		return `${filePath}\u0000${functionName ?? ""}\u0000${revision}`;
	}

	set(
		filePath: string,
		functionName: string | undefined,
		revision: string,
		snapshot: RevisionSnapshot,
	): void {
		this.removeExpired();
		this.snapshots.set(this.key(filePath, functionName, revision), {
			snapshot,
			createdAt: this.now(),
		});
		while (this.snapshots.size > this.maxEntries) {
			const oldest = this.snapshots.keys().next().value;
			if (oldest === undefined) break;
			this.snapshots.delete(oldest);
		}
	}

	get(
		filePath: string,
		functionName: string | undefined,
		revision: string,
	): RevisionSnapshot | undefined {
		this.removeExpired();
		return this.snapshots.get(this.key(filePath, functionName, revision))
			?.snapshot;
	}

	private removeExpired(): void {
		const cutoff = this.now() - this.maxAgeMs;
		for (const [key, stored] of this.snapshots) {
			if (stored.createdAt < cutoff) this.snapshots.delete(key);
		}
	}
}
