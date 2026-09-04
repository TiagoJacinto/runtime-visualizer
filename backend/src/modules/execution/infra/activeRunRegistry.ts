import type { ActiveExecution, ExecutionUpdate } from "../../../../../packages/contracts/src/index.ts";

export class ActiveRunRegistry {
  private readonly runs = new Map<string, ActiveExecution>();

  register(run: ActiveExecution): void { this.runs.set(run.executionId, run); }
  get(id: string): ActiveExecution | undefined { return this.runs.get(id); }
  list(): readonly ActiveExecution[] {
    return [...this.runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.displayNumber - a.displayNumber);
  }
  update(update: ExecutionUpdate): void {
    const current = this.runs.get(update.executionId);
    if (!current || update.status !== "Running") return;
    this.runs.set(update.executionId, { ...current, currentNodeId: update.currentNodeId });
  }
  remove(id: string): void { this.runs.delete(id); }
  clear(): void { this.runs.clear(); }
}
