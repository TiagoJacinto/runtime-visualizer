import type { z } from "zod";

import { HttpError } from "./errors.ts";

// SAFETY: these functions are the shared I/O parsing boundary.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
const parse = <T extends z.ZodType>(
  schema: T,
  // SAFETY: the schema is the parser for this untrusted boundary value.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  input: unknown,
  fallbackMessage: string
): z.output<T> => {
  const result = schema.safeParse(input);
  if (!result.success) {
    const [issue] = result.error.issues;
    throw new HttpError(400, issue?.message ?? fallbackMessage);
  }
  return result.data;
};
export const parseBody = <T extends z.ZodType>(
  schema: T,
  // SAFETY: request bodies are untrusted until the schema above parses them.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  body: unknown
): z.output<T> => parse(schema, body, "Invalid request body.");
export const parseQuery = <T extends z.ZodType>(
  schema: T,
  // SAFETY: query strings are untrusted until the schema above parses them.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  query: unknown,
  fallbackMessage = "Invalid request query."
): z.output<T> => parse(schema, query, fallbackMessage);
export const parseParams = <T extends z.ZodType>(
  schema: T,
  // SAFETY: route params are untrusted until the schema above parses them.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  params: unknown,
  fallbackMessage = "Invalid request parameters."
): z.output<T> => parse(schema, params, fallbackMessage);
