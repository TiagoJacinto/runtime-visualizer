import type { ActiveExecution } from "../../../../../packages/contracts/src/index.ts";
import { Execution } from "../execution.ts";

export class ActiveRunRegistry {
  private readonly runs = new Map<string, Execution>();

  register(execution: Execution): void {
    this.runs.set(execution.executionId, execution);
  }

  get(id: string): Execution | undefined {
    return this.runs.get(id);
  }

  list(): readonly ActiveExecution[] {
    return [...this.runs.values()]
      .map((execution) => execution.snapshot())
      .sort(
        (a, b) =>
          b.startedAt.localeCompare(a.startedAt) ||
          b.displayNumber - a.displayNumber,
      );
  }

  remove(id: string): void {
    this.runs.delete(id);
  }

  clear(): void {
    this.runs.clear();
  }
}
