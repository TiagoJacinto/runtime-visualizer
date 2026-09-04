import {
  AnalysisErrorSchema,
  AnalysisResponseSchema,
  RevisionHistoryResponseSchema,
  type AnalysisResponse,
  type RevisionKey,
  type RevisionSummary,
} from "@runtime-visualizer/contracts";

export type AnalysisGateway = {
  listFiles(signal?: AbortSignal): Promise<readonly string[]>;
  analyse(
    file: string,
    procedureId?: string,
    signal?: AbortSignal,
  ): Promise<AnalysisResponse>;
  listRevisions(
    scope: Pick<RevisionKey, "file" | "procedureId">,
    signal?: AbortSignal,
  ): Promise<readonly RevisionSummary[]>;
  load(key: RevisionKey, signal?: AbortSignal): Promise<AnalysisResponse>;
};

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

function errorFromResponse(value: unknown, status: number): Error {
  const parsed = AnalysisErrorSchema.safeParse(value);
  return new Error(
    parsed.success ? parsed.data.error : `Backend request failed (${status})`,
  );
}

export function createAnalysisGateway(
  fetcher: typeof fetch = fetch,
): AnalysisGateway {
  const parseAnalysis = async (
    response: Response,
  ): Promise<AnalysisResponse> => {
    const value = await readJson(response);
    if (!response.ok) {
      const diagnostic = AnalysisErrorSchema.safeParse(value);
      if (response.status === 422 && diagnostic.success) {
        const procedure = diagnostic.data.procedures[0];
        if (procedure !== undefined)
          return { ...diagnostic.data, procedure, cfg: null };
      }
      throw errorFromResponse(value, response.status);
    }
    return AnalysisResponseSchema.parse(value);
  };

  return {
    async listFiles(signal) {
      const response = await fetcher("/api/files", { signal });
      const value = await readJson(response);
      if (!response.ok || !Array.isArray(value))
        throw new Error("Invalid file response");
      return value.filter(
        (file): file is string =>
          typeof file === "string" && /\.(ts|tsx)$/.test(file),
      );
    },
    async analyse(file, procedureId, signal) {
      const query = new URLSearchParams({ file });
      if (procedureId !== undefined) query.set("procedureId", procedureId);
      return parseAnalysis(await fetcher(`/api/analysis?${query}`, { signal }));
    },
    async listRevisions(scope, signal) {
      const query = new URLSearchParams(scope);
      const response = await fetcher(`/api/analysis/revisions?${query}`, {
        signal,
      });
      const value = await readJson(response);
      if (!response.ok) throw errorFromResponse(value, response.status);
      return RevisionHistoryResponseSchema.parse(value).revisions;
    },
    async load(key, signal) {
      const query = new URLSearchParams(key);
      return parseAnalysis(await fetcher(`/api/analysis?${query}`, { signal }));
    },
  };
}
