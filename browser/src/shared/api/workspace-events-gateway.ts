import { WorkspaceEventSchema } from "@runtime-visualizer/contracts";
import type { WorkspaceEvent } from "@runtime-visualizer/contracts";

import { WorkspaceEventsConnectionError } from "./workspace-events-connection-error";

export interface WorkspaceEventRecord {
  id: number;
  event: WorkspaceEvent;
}
const parseRecord = (record: string): WorkspaceEventRecord | undefined => {
  const data = record
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .join("\n");
  if (data.length === 0) {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    throw new WorkspaceEventsConnectionError("Invalid workspace event JSON");
  }
  const parsed = WorkspaceEventSchema.safeParse(value);
  if (!parsed.success) {
    throw new WorkspaceEventsConnectionError("Invalid workspace event");
  }
  const idLine = record.split("\n").find((line) => line.startsWith("id:"));
  const id = Number(idLine?.slice("id:".length).trim() ?? 0);
  if (!Number.isSafeInteger(id) || id < 0) {
    throw new WorkspaceEventsConnectionError("Invalid workspace event ID");
  }
  return { event: parsed.data, id };
};
export class WorkspaceEventsGateway {
  private readonly fetcher: typeof fetch;

  constructor(fetcher: typeof fetch = fetch) {
    this.fetcher = fetcher.bind(globalThis);
  }
  async *subscribe(
    signal: AbortSignal,
    lastEventId?: number | null
  ): AsyncIterable<WorkspaceEventRecord> {
    const headers: HeadersInit = {};
    if (lastEventId !== undefined && lastEventId !== null) {
      headers["Last-Event-ID"] = String(lastEventId);
    }
    let response: Response;
    try {
      response = await this.fetcher("/api/events", { headers, signal });
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      throw new WorkspaceEventsConnectionError(
        error instanceof Error ? error.message : undefined
      );
    }
    if (!response.ok || response.body === null) {
      throw new WorkspaceEventsConnectionError();
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (!signal.aborted) {
        // SAFETY: stream chunks must be consumed in order.
        // oxlint-disable-next-line eslint/no-await-in-loop
        const result = await reader.read();
        if (result.done) {
          break;
        }
        buffer += decoder.decode(result.value, { stream: true });
        const records = buffer.split("\n\n");
        buffer = records.pop() ?? "";
        for (const record of records) {
          const parsed = parseRecord(record);
          if (parsed !== undefined) {
            yield parsed;
          }
        }
      }
      if (signal.aborted) {
        return;
      }
      throw new WorkspaceEventsConnectionError("Workspace event stream ended");
    } finally {
      try {
        await reader.cancel();
      } catch {
        // Cancellation is best effort when the stream has already closed.
      }
      reader.releaseLock();
    }
  }
}
export type WorkspaceEventsGatewayPort = Pick<
  WorkspaceEventsGateway,
  "subscribe"
>;
