export type ProcedureResource = {
	readonly id: string;
	readonly kind: "TopLevel" | "Function";
	readonly name: string | null;
	readonly label: string;
};

export type SourceResource = {
	readonly file: string;
	readonly source: string;
	readonly revision: string;
};
