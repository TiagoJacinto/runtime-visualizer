export type Agent = (prompt: string) => Promise<void> | void;

export interface ExecuteWithAgentFixOptions<T> {
  readonly maxAttempts?: number;
  readonly isFailure?: (result: T) => boolean;
  readonly formatFailure?: (result: T) => string;
  readonly agent?: Agent;
}

export async function executeWithAgentFix<T>(
  execute: () => T | Promise<T>,
  repairOrOptions:
    | ((error: Error, attempt: number) => void | Promise<void>)
    | ExecuteWithAgentFixOptions<T>,
  options: ExecuteWithAgentFixOptions<T> = {},
): Promise<T> {
  const repair =
    typeof repairOrOptions === "function"
      ? repairOrOptions
      : async (error: Error, attempt: number) =>
          repairOrOptions.agent?.(`Fix attempt ${attempt}: ${error.message}`);
  const resolved =
    typeof repairOrOptions === "function" ? options : repairOrOptions;
  const maxAttempts = resolved.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1)
    throw new Error("maxAttempts must be a positive integer");
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await execute();
      if (!resolved.isFailure || !resolved.isFailure(result)) return result;
      lastError = new Error(
        resolved.formatFailure?.(result) ?? "operation failed",
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    if (attempt < maxAttempts) await repair(lastError!, attempt);
  }
  throw lastError ?? new Error("execution repair loop failed");
}
