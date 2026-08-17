import { describe, expect, it } from "vitest";
import { createAnalysisGateway } from "../../../src/shared/api/analysisGateway";

const diagnosticResponse = {
    error: "Analysis failed",
    file: "fixtures/entry.ts",
    revision: "revision-1",
    source: "const value: number = 'invalid';",
    procedures: [
        { id: "top-level", kind: "TopLevel", name: null, label: "Top level" },
    ],
    diagnostics: [
        {
            procedure: "fixtures/entry.ts",
            reason: "Type error",
            message: "Type mismatch",
        },
    ],
};

describe("analysis gateway", () => {
    it("retains source and Procedures when analysis returns diagnostics", async () => {
        const gateway = createAnalysisGateway(
            async () =>
                new Response(JSON.stringify(diagnosticResponse), {
                    status: 422,
                }),
        );

        await expect(
            gateway.analyse("fixtures/entry.ts"),
        ).resolves.toMatchObject({
            file: "fixtures/entry.ts",
            source: diagnosticResponse.source,
            procedures: diagnosticResponse.procedures,
            diagnostics: diagnosticResponse.diagnostics,
            procedure: diagnosticResponse.procedures[0],
            cfg: null,
        });
    });
});
