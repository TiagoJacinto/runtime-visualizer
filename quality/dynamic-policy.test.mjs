import assert from "node:assert/strict";
import test from "node:test";
import {
	coverageTarget,
	describeCoverageRequirement,
	validateProcedureInputs,
} from "./dynamic-policy.mjs";

test("maps numeric importance directly between the static coverage floor and ceiling", () => {
	assert.equal(coverageTarget({ importance: 0, branchCount: 0 }), 58);
	assert.equal(coverageTarget({ importance: 50, branchCount: 0 }), 77);
	assert.equal(coverageTarget({ importance: 100, branchCount: 0 }), 95);
});

test("raises the requirement for static branch complexity", () => {
	assert.equal(coverageTarget({ importance: 0, branchCount: 8 }), 70);
	assert.equal(coverageTarget({ importance: 0, branchCount: 15 }), 80);
	assert.equal(coverageTarget({ importance: 0, branchCount: 30 }), 90);
});

test("uses procedure input over file input over the default", () => {
	const inputs = validateProcedureInputs({
		default: { importance: 20 },
		files: { "backend/src/example.ts": { importance: 40 } },
		procedures: {
			"backend/src/example.ts#run": { importance: 80 },
		},
	});
	assert.equal(
		describeCoverageRequirement({
			path: "backend/src/example.ts",
			functionName: "run",
			branchCount: 0,
			inputs,
		}).target,
		88,
	);
});

test("rejects string ratings", () => {
	assert.throws(
		() =>
			validateProcedureInputs({
				default: { importance: "80" },
				files: {},
				procedures: {},
			}),
		/Procedure inputs are invalid/,
	);
});
