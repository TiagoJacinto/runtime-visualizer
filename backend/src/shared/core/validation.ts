import type { z } from "zod";
import { HttpError } from "./errors.ts";

function parse<T extends z.ZodType>(
	schema: T,
	input: unknown,
	fallbackMessage: string,
): z.output<T> {
	const result = schema.safeParse(input);
	if (!result.success) {
		const issue = result.error.issues[0];
		throw new HttpError(400, issue?.message ?? fallbackMessage);
	}
	return result.data;
}

export function parseBody<T extends z.ZodType>(
	schema: T,
	body: unknown,
): z.output<T> {
	return parse(schema, body, "Invalid request body.");
}

export function parseQuery<T extends z.ZodType>(
	schema: T,
	query: unknown,
	fallbackMessage = "Invalid request query.",
): z.output<T> {
	return parse(schema, query, fallbackMessage);
}

export function parseParams<T extends z.ZodType>(
	schema: T,
	params: unknown,
	fallbackMessage = "Invalid request parameters.",
): z.output<T> {
	return parse(schema, params, fallbackMessage);
}
