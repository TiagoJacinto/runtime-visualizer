import { z } from "zod";
import { qualityPolicyValues } from "./policy-values.mjs";

const policySchema = z
	.object({
		version: z.number().int().positive(),
		ratings: z
			.object({
				minimum: z.number().finite(),
				maximum: z.number().finite(),
			})
			.strict(),
		coverage: z
			.object({
				repositoryThresholds: z.record(z.string(), z.number().finite()),
				changedCode: z
					.object({
						floor: z.number().finite(),
						ceiling: z.number().finite(),
						defaultImportance: z.number().finite(),
						exclusions: z.array(
							z
								.object({
									pattern: z.string().min(1),
									reason: z.string().min(1),
								})
								.strict(),
						),
					})
					.strict(),
				branchTargets: z.array(
					z
						.object({
							minimumBranches: z.number().int().nonnegative(),
							target: z.number().finite(),
						})
						.strict(),
				),
			})
			.strict(),
	})
	.strict()
	.superRefine((policy, context) => {
		const { minimum, maximum } = policy.ratings;
		if (minimum >= maximum) {
			context.addIssue({
				code: "custom",
				path: ["ratings"],
				message: "minimum must be less than maximum",
			});
		}
		for (const [metric, value] of Object.entries(
			policy.coverage.repositoryThresholds,
		)) {
			addRangeIssue(
				context,
				value,
				["coverage", "repositoryThresholds", metric],
				minimum,
				maximum,
			);
		}
		const changed = policy.coverage.changedCode;
		if (changed.floor > changed.ceiling) {
			context.addIssue({
				code: "custom",
				path: ["coverage", "changedCode"],
				message: "floor must not exceed ceiling",
			});
		}
		for (const field of ["floor", "ceiling", "defaultImportance"]) {
			addRangeIssue(
				context,
				changed[field],
				["coverage", "changedCode", field],
				minimum,
				maximum,
			);
		}
		if (policy.coverage.branchTargets.length === 0) {
			context.addIssue({
				code: "custom",
				path: ["coverage", "branchTargets"],
				message: "must contain at least one target",
			});
		}
		let previousMinimum;
		for (const [index, target] of policy.coverage.branchTargets.entries()) {
			if (
				previousMinimum !== undefined &&
				target.minimumBranches <= previousMinimum
			) {
				context.addIssue({
					code: "custom",
					path: ["coverage", "branchTargets", index, "minimumBranches"],
					message: "must be greater than the previous threshold",
				});
			}
			addRangeIssue(
				context,
				target.target,
				["coverage", "branchTargets", index, "target"],
				minimum,
				maximum,
			);
			previousMinimum = target.minimumBranches;
		}
	});

function addRangeIssue(context, value, path, minimum, maximum) {
	if (value < minimum || value > maximum) {
		context.addIssue({
			code: "custom",
			path,
			message: `must be between ${minimum} and ${maximum}`,
		});
	}
}

function formatIssues(error) {
	return error.issues
		.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
		.join("; ");
}

function ratingSchema(ratings) {
	return z.number().finite().min(ratings.minimum).max(ratings.maximum);
}

export function validateRating(
	value,
	label,
	ratings = qualityPolicyValues.ratings,
) {
	const result = ratingSchema(ratings).safeParse(value);
	if (!result.success) {
		throw new Error(
			`${label} must be a finite number between ${ratings.minimum} and ${ratings.maximum}.`,
		);
	}
	return result.data;
}

export function validateQualityPolicy(policy = qualityPolicyValues) {
	const result = policySchema.safeParse(policy);
	if (!result.success) {
		throw new Error(`Quality policy is invalid: ${formatIssues(result.error)}`);
	}
	return result.data;
}

export function validateProcedureInputs(inputs, policy = qualityPolicyValues) {
	const validPolicy = validateQualityPolicy(policy);
	const rating = ratingSchema(validPolicy.ratings);
	const evidence = z
		.object({
			importance: rating.optional(),
			securityCriticality: rating.optional(),
			performanceCriticality: rating.optional(),
		})
		.strict();
	const inputsSchema = z
		.object({
			default: evidence.extend({ importance: rating }),
			files: z.record(z.string(), evidence),
			procedures: z.record(z.string(), evidence),
		})
		.strict();
	const result = inputsSchema.safeParse(inputs);
	if (!result.success) {
		throw new Error(
			`Procedure inputs are invalid: ${formatIssues(result.error)}`,
		);
	}
	return result.data;
}

export function coverageTarget(
	{ importance, branchCount },
	policy = qualityPolicyValues,
) {
	const validPolicy = validateQualityPolicy(policy);
	const { ratings, coverage } = validPolicy;
	const { floor, ceiling } = coverage.changedCode;
	const minimumBranches = coverage.branchTargets[0].minimumBranches;
	if (!Number.isInteger(branchCount) || branchCount < minimumBranches) {
		throw new Error("branchCount must be a non-negative integer.");
	}
	const importanceTarget =
		floor +
		((ceiling - floor) *
			(validateRating(importance, "importance", ratings) - ratings.minimum)) /
			(ratings.maximum - ratings.minimum);
	const branchTarget = coverage.branchTargets
		.filter((rule) => branchCount >= rule.minimumBranches)
		.at(-1).target;
	return Math.round(Math.max(floor, importanceTarget, branchTarget));
}

export function evidenceFor({ path, functionName, inputs }) {
	const fileEvidence = inputs.files[path];
	const procedureEvidence =
		functionName === undefined
			? undefined
			: inputs.procedures[`${path}#${functionName}`];
	return { ...inputs.default, ...fileEvidence, ...procedureEvidence };
}

export function describeCoverageRequirement({
	path,
	functionName,
	branchCount,
	inputs,
}) {
	const evidence = evidenceFor({ path, functionName, inputs });
	const target = coverageTarget({
		importance: evidence.importance,
		branchCount,
	});
	return { target, evidence, functionName };
}
