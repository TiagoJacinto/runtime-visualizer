import { analyseProject } from "../../../cfg/index.ts";
import type { ControlFlowGraph, GraphDiagnostic } from "../../../cfg/index.ts";
import {
	discoverProcedures,
	isSourceFile,
	listSourceFiles,
	readSource,
	type ProcedureResource,
} from "../../../source/index.ts";
import type { RevisionStore } from "../../../execution/infra/revision-store.ts";

export type AnalysisSnapshot = {
	readonly file: string;
	readonly procedure: ProcedureResource;
	readonly revision: string;
	readonly source: string;
	readonly procedures: readonly ProcedureResource[];
	readonly cfg: ControlFlowGraph | null;
	readonly diagnostics: readonly GraphDiagnostic[];
};

export type AnalysisError = {
	readonly error: string;
	readonly file: string;
	readonly revision: string;
	readonly source: string;
	readonly procedures: readonly ProcedureResource[];
	readonly diagnostics: readonly GraphDiagnostic[];
};

export type AnalyseSavedProcedureResult =
	| { readonly ok: true; readonly snapshot: AnalysisSnapshot }
	| { readonly ok: false; readonly error: AnalysisError };

export type AnalyseSavedProcedureInput = {
	readonly file: string;
	readonly name?: string;
	readonly showImports?: boolean;
};

export async function analyseSavedProcedure(
	filesFolder: string,
	revisionStore: RevisionStore,
	input: AnalyseSavedProcedureInput,
): Promise<AnalyseSavedProcedureResult> {
	const resource = await readSource(filesFolder, input.file);
	const procedures = discoverProcedures(resource.source, resource.file);
	const selectedProcedure = findProcedure(procedures, input.name);

	const sourceFiles = (await listSourceFiles(filesFolder)).filter(isSourceFile);
	const entries: Array<readonly [string, string]> = [];
	let nextIndex = 0;
	const readNext = async (): Promise<void> => {
		while (nextIndex < sourceFiles.length) {
			const file = sourceFiles[nextIndex];
			nextIndex += 1;
			if (file === undefined) return;
			entries.push([file, (await readSource(filesFolder, file)).source]);
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(8, sourceFiles.length) }, () => readNext()),
	);
	const files = Object.fromEntries(entries);

	const analysis = analyseProject({
		source: resource.source,
		filePath: resource.file,
		functionName: input.name,
		files,
		showImports: input.showImports,
	});

	if (analysis.diagnostics.length > 0) {
		return {
			ok: false,
			error: {
				error: "Analysis failed",
				file: resource.file,
				revision: resource.revision,
				source: resource.source,
				procedures,
				diagnostics: analysis.diagnostics,
			},
		};
	}

	const procedure = analysis.cfg?.procedures?.[0];
	if (procedure === undefined) {
		return {
			ok: false,
			error: {
				error: "No executable Procedure found",
				file: resource.file,
				revision: resource.revision,
				source: resource.source,
				procedures,
				diagnostics: [],
			},
		};
	}

	revisionStore.set(resource.file, input.name, resource.revision, {
		source: resource.source,
		filePath: resource.file,
		functionName: input.name,
		files,
		procedure,
	});

	return {
		ok: true,
		snapshot: {
			file: resource.file,
			procedure: selectedProcedure,
			revision: resource.revision,
			source: resource.source,
			procedures,
			cfg: analysis.cfg ?? null,
			diagnostics: analysis.diagnostics,
		},
	};
}

function findProcedure(
	procedures: readonly ProcedureResource[],
	name: string | undefined,
): ProcedureResource {
	if (name === undefined) return procedures[0] as ProcedureResource;
	return (
		procedures.find((p) => p.name === name) ?? (procedures[0] as ProcedureResource)
	);
}
