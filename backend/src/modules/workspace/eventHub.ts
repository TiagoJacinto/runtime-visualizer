import {
  WorkspaceEventSchema,
  type WorkspaceEvent,
} from "../../../../packages/contracts/src/index.ts";

type Record = { readonly id: number; readonly event: WorkspaceEvent };
type Listener = (record: Record) => void;

/** Process-local, bounded event log used by all Workspace SSE consumers. */
export class WorkspaceEventHub {
  private nextId = 1;
  private readonly retained: Record[] = [];
  private readonly listeners = new Set<Listener>();

  constructor(private readonly capacity = 10_000) {}

  publish(event: WorkspaceEvent): number {
    const valid = WorkspaceEventSchema.parse(event);
    const record = { id: this.nextId++, event: valid };
    this.retained.push(record);
    while (this.retained.length > this.capacity) this.retained.shift();
    for (const listener of this.listeners) {
      try { listener(record); } catch { this.listeners.delete(listener); }
    }
    return record.id;
  }

  subscribe(lastEventId?: number, listener?: Listener): { replay: readonly Record[]; resyncRequired: boolean; unsubscribe: () => void } {
    const oldest = this.retained[0]?.id;
    const resyncRequired = lastEventId !== undefined && oldest !== undefined && lastEventId < oldest - 1;
    // A fresh client receives active-state hydration from the events route;
    // replay is only meaningful when the client presents a cursor. Replaying
    // the whole process-local log to every new browser would leak terminal
    // notifications from earlier sessions into a fresh workspace.
    const replay =
      resyncRequired || lastEventId === undefined
        ? []
        : this.retained.filter((record) => record.id > lastEventId);
    if (listener) this.listeners.add(listener);
    return { replay, resyncRequired, unsubscribe: () => { if (listener) this.listeners.delete(listener); } };
  }

  close(): void { this.listeners.clear(); this.retained.length = 0; }
}
export type WorkspaceEventRecord = Record;
