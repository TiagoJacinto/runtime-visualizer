import { FileChangeEventSchema, type FileChangeEvent } from "@runtime-visualizer/contracts";

export type FileEventsGateway = {
  subscribe(signal: AbortSignal): AsyncIterable<FileChangeEvent>;
};

export class FileEventsConnectionError extends Error {
  constructor(message = "Backend events unavailable") {
    super(message);
    this.name = "FileEventsConnectionError";
  }
}

export function createFileEventsGateway(fetcher: typeof fetch = fetch): FileEventsGateway {
  return {
    async *subscribe(signal) {
      let response: Response;
      try {
        response = await fetcher("/api/events", { signal });
      } catch (error) {
        if (signal.aborted) return;
        throw new FileEventsConnectionError(error instanceof Error ? error.message : undefined);
      }
      if (!response.ok || !response.body) throw new FileEventsConnectionError();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) {
            if (!signal.aborted) throw new FileEventsConnectionError("File event stream ended");
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const records = buffer.split("\n\n");
          buffer = records.pop() ?? "";
          for (const record of records) {
            const data = record.split("\n").find((line) => line.startsWith("data:"));
            if (!data) continue;
            const parsed = FileChangeEventSchema.safeParse(JSON.parse(data.slice(5).trim()));
            if (!parsed.success) throw new FileEventsConnectionError("Invalid file event");
            yield parsed.data;
          }
        }
      } finally {
        try { await reader.cancel(); } catch { /* disposed stream */ }
        reader.releaseLock();
      }
    },
  };
}
