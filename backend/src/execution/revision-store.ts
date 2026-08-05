import type { ProcedureCfg } from "../cfg/types.ts";

export type RevisionSnapshot = {
	readonly source: string;
	readonly filePath: string;
	readonly functionName: string | undefined;
	readonly procedure: ProcedureCfg;
};

export class RevisionStore {
	private readonly snapshots = new Map<string, RevisionSnapshot>();

	private key(filePath: string, functionName: string | undefined, revision: string): string {
		return `${filePath}\u0000${functionName ?? ""}\u0000${revision}`;
	}

	set(
		filePath: string,
		functionName: string | undefined,
		revision: string,
		snapshot: RevisionSnapshot,
	): void {
		this.snapshots.set(this.key(filePath, functionName, revision), snapshot);
	}

	get(
		filePath: string,
		functionName: string | undefined,
		revision: string,
	): RevisionSnapshot | undefined {
		return this.snapshots.get(this.key(filePath, functionName, revision));
	}
}
