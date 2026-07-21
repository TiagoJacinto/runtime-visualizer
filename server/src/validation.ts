import type { z } from "zod";
import { HttpError } from "./errors.ts";

export function parseBody<T extends z.ZodType>(
	schema: T,
	body: unknown,
): z.output<T> {
	const result = schema.safeParse(body);
	if (!result.success) {
		const issue = result.error.issues[0];
		throw new HttpError(400, issue?.message ?? "Invalid request body.");
	}
	return result.data;
}
