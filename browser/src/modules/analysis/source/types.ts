export interface ProcedureResource {
  readonly id: string;
  readonly kind: "TopLevel" | "Function";
  readonly name: string | null;
  readonly label: string;
}

export interface SourceResource {
  readonly file: string;
  readonly source: string;
  readonly revision: string;
}
