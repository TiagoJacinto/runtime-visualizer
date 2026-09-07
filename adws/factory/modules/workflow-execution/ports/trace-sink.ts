export interface TraceEvent {
  readonly runIdentifier: string;
  readonly type: string;
  readonly phase?: string;
  readonly name?: string;
  readonly payload?: Record<string, unknown>;
  readonly at?: string;
}

export interface TraceSinkPort {
  record(event: TraceEvent): void | Promise<void>;
  project(runIdentifier: string): readonly TraceEvent[];
}
