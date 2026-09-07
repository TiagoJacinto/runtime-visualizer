import type { TraceEvent, TraceSinkPort } from "../../ports/trace-sink";

/** In-memory trace sink for deterministic tests. */
export class DeterministicTraceSink implements TraceSinkPort {
  readonly events: TraceEvent[] = [];
  record(event: TraceEvent): void {
    this.events.push(event);
  }
  project(runIdentifier: string): readonly TraceEvent[] {
    return this.events.filter((event) => event.runIdentifier === runIdentifier);
  }
}
