import { describe, expect, it } from "vitest";
import {
	AnalysisErrorSchema,
	AnalysisResponseSchema,
	ExecuteProcedureRequestSchema,
	ExecuteProcedureResponseSchema,
	ExecutionIdSchema,
	ProcedureScopeSchema,
	RevisionHistoryResponseSchema,
	RevisionKeySchema,
	RevisionSummarySchema,
	WorkspaceEventSchema,
} from "../src/index.ts";

describe("runtime contracts", () => {
	it("accepts valid procedure, revision, analysis, and execution values", () => {
		const scope = ProcedureScopeSchema.parse({
			file: "source.ts",
			procedureId: "function:run",
		});
		expect(RevisionKeySchema.parse({ ...scope, revision: "revision-1" })).toEqual(
			{
				...scope,
				revision: "revision-1",
			},
		);
		expect(
			RevisionSummarySchema.parse({
				...scope,
				revision: "revision-1",
				analyzedAt: "2026-01-01T00:00:00.000Z",
				runnable: true,
				diagnosticCount: 0,
			}),
		).toMatchObject(scope);
		expect(ExecutionIdSchema.parse("execution-1")).toBe("execution-1");
		expect(
			ExecuteProcedureRequestSchema.parse({ ...scope, revision: "revision-1" }),
		).toMatchObject(scope);
		expect(
			ExecuteProcedureResponseSchema.parse({ executionId: "execution-1" }),
		).toEqual({ executionId: "execution-1" });
	});

	it("requires valid analysis and event payloads", () => {
		const analysis = {
			file: "source.ts",
			procedure: {
				id: "function:run",
				kind: "Function",
				name: "run",
				label: "run",
			},
			procedureId: "function:run",
			revision: "revision-1",
			source: "export function run() {}",
			procedures: [],
			cfg: null,
			diagnostics: [],
		};
		expect(AnalysisResponseSchema.parse(analysis)).toMatchObject(analysis);
		expect(
			AnalysisErrorSchema.parse({ ...analysis, error: "Not found" }),
		).toMatchObject({ error: "Not found" });
		expect(
			RevisionHistoryResponseSchema.parse({
				file: "source.ts",
				procedure: "run",
				revisions: [],
			}),
		).toEqual({ file: "source.ts", procedure: "run", revisions: [] });
		expect(WorkspaceEventSchema.parse({ type: "resync-required" })).toEqual({
			type: "resync-required",
		});
	});

	it("rejects invalid identifiers and timestamps", () => {
		expect(() =>
			ProcedureScopeSchema.parse({ file: "", procedureId: "" }),
		).toThrow();
		expect(() => ExecutionIdSchema.parse("")).toThrow();
		expect(() =>
			RevisionSummarySchema.parse({
				file: "source.ts",
				procedureId: "function:run",
				revision: "revision-1",
				analyzedAt: "not-a-date",
				runnable: true,
				diagnosticCount: 0,
			}),
		).toThrow();
	});
});
