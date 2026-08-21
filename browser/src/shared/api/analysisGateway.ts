import {
  AnalysisErrorSchema,
  AnalysisResponseSchema,
  type AnalysisResponse,
} from "@runtime-visualizer/contracts";

export type AnalysisGateway = {
  listFiles(signal?: AbortSignal): Promise<string[]>;
  analyse(
    file: string,
    procedure?: string,
    signal?: AbortSignal,
  ): Promise<AnalysisResponse>;
};

async function json<T>(
  response: Response,
  parse: (value: unknown) => T,
): Promise<T> {
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = AnalysisErrorSchema.safeParse(value);
    throw new Error(
      error.success
        ? error.data.error
        : `Backend request failed (${response.status})`,
    );
  }
  return parse(value);
}

export function createAnalysisGateway(
  fetcher: typeof fetch = fetch,
): AnalysisGateway {
  return {
    async listFiles(signal) {
      const response = await fetcher("/api/files", { signal });
      return json(response, (value) => {
        if (
          !Array.isArray(value) ||
          !value.every((item) => typeof item === "string")
        )
          throw new Error("Invalid file response");
        return value.filter((file) => /\.(ts|tsx)$/.test(file));
      });
    },
    async analyse(file, procedure, signal) {
      const query = new URLSearchParams({ file });
      if (procedure) query.set("name", procedure);
      const response = await fetcher(`/api/analysis?${query}`, { signal });
      if (response.status === 422) {
        const error = AnalysisErrorSchema.parse(await response.json());
        const selectedProcedure = error.procedures[0];
        if (selectedProcedure === undefined) throw new Error(error.error);
        return {
          ...error,
          procedure: selectedProcedure,
          cfg: null,
        };
      }
      return json(response, (value) => AnalysisResponseSchema.parse(value));
    },
  };
}
