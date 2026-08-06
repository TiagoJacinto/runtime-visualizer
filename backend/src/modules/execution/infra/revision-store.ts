import type { ProcedureCfg } from "../../cfg/index.ts";

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
	refs: number;
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
		const key = this.key(filePath, functionName, revision);
		const existing = this.snapshots.get(key);
		this.snapshots.delete(key);
		this.snapshots.set(key, {
			snapshot,
			createdAt: this.now(),
			refs: existing?.refs ?? 0,
		});
		while (this.snapshots.size > this.maxEntries) {
			const evictable = [...this.snapshots].find(
				([, stored]) => stored.refs === 0,
			);
			if (evictable === undefined) break;
			this.snapshots.delete(evictable[0]);
		}
	}

	acquire(
		filePath: string,
		functionName: string | undefined,
		revision: string,
	): RevisionSnapshot | undefined {
		this.removeExpired();
		const stored = this.snapshots.get(
			this.key(filePath, functionName, revision),
		);
		if (stored === undefined) return undefined;
		stored.refs += 1;
		return stored.snapshot;
	}

	release(
		filePath: string,
		functionName: string | undefined,
		revision: string,
	): void {
		const stored = this.snapshots.get(
			this.key(filePath, functionName, revision),
		);
		if (stored !== undefined) stored.refs = Math.max(0, stored.refs - 1);
	}

	private removeExpired(): void {
		const cutoff = this.now() - this.maxAgeMs;
		for (const [key, stored] of this.snapshots) {
			if (stored.refs === 0 && stored.createdAt < cutoff)
				this.snapshots.delete(key);
		}
	}
}
