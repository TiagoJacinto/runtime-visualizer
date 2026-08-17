import { FileChangeEventSchema, type FileChangeEvent } from "@runtime-visualizer/contracts";

export type FileEventsGateway = {
  subscribe(signal: AbortSignal): AsyncIterable<FileChangeEvent>;
};

export function createFileEventsGateway(fetcher: typeof fetch = fetch): FileEventsGateway {
  return {
    async *subscribe(signal) {
      const response = await fetcher("/api/events", { signal });
      if (!response.ok || !response.body) throw new Error("Backend events unavailable");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const records = buffer.split("\n\n");
          buffer = records.pop() ?? "";
          for (const record of records) {
            const data = record.split("\n").find((line) => line.startsWith("data:"));
            if (!data) continue;
            const parsed = FileChangeEventSchema.safeParse(JSON.parse(data.slice(5).trim()));
            if (parsed.success) yield parsed.data;
          }
        }
      } finally {
        try { await reader.cancel(); } catch { /* disposed stream */ }
      }
    },
  };
}
