import { readFileSync } from "node:fs";

let qualityPolicyValues;
try {
	qualityPolicyValues = JSON.parse(
		readFileSync(new URL("./policy.json", import.meta.url), "utf8"),
	);
} catch (error) {
	throw new Error(`Unable to load quality/policy.json: ${error.message}`, {
		cause: error,
	});
}

export { qualityPolicyValues };
