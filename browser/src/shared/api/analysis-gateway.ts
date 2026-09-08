import {
  AnalysisErrorSchema,
  AnalysisResponseSchema,
  RevisionHistoryResponseSchema,
} from "@runtime-visualizer/contracts";
import type {
  AnalysisResponse,
  RevisionKey,
  RevisionSummary,
} from "@runtime-visualizer/contracts";

// SAFETY: response JSON is parsed by the Zod schemas at each call site.
// oxlint-disable-next-line anti-slop/no-unknown-returns
const readJson = (response: Response): Promise<unknown> => response.json();
// SAFETY: error responses are validated before their message is exposed.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
const errorFromResponse = (value: unknown, status: number): Error => {
  const parsed = AnalysisErrorSchema.safeParse(value);
  return new Error(
    parsed.success ? parsed.data.error : `Backend request failed (${status})`
  );
};
export class AnalysisGateway {
  private readonly fetcher: typeof fetch;

  constructor(fetcher: typeof fetch = fetch) {
    this.fetcher = fetcher;
  }
  private static async parseAnalysis(
    response: Response
  ): Promise<AnalysisResponse> {
    const value = await readJson(response);
    if (!response.ok) {
      const diagnostic = AnalysisErrorSchema.safeParse(value);
      if (response.status === 422 && diagnostic.success) {
        const [procedure] = diagnostic.data.procedures;
        if (procedure !== undefined) {
          return { ...diagnostic.data, cfg: null, procedure };
        }
      }
      throw errorFromResponse(value, response.status);
    }
    return AnalysisResponseSchema.parse(value);
  }
  async listFiles(signal?: AbortSignal): Promise<readonly string[]> {
    const response = await this.fetcher("/api/files", { signal });
    const value = await readJson(response);
    if (!response.ok || !Array.isArray(value)) {
      throw new Error("Invalid file response");
    }
    return value.filter(
      (file): file is string =>
        typeof file === "string" && /\.(?:ts|tsx)$/u.test(file)
    );
  }
  async analyse(
    file: string,
    procedureId?: string,
    signal?: AbortSignal
  ): Promise<AnalysisResponse> {
    const query = new URLSearchParams({ file });
    if (procedureId !== undefined) {
      query.set("procedureId", procedureId);
    }
    return AnalysisGateway.parseAnalysis(
      await this.fetcher(`/api/analysis?${query}`, { signal })
    );
  }
  async listRevisions(
    scope: Pick<RevisionKey, "file" | "procedureId">,
    signal?: AbortSignal
  ): Promise<readonly RevisionSummary[]> {
    const query = new URLSearchParams(scope);
    const response = await this.fetcher(`/api/analysis/revisions?${query}`, {
      signal,
    });
    const value = await readJson(response);
    if (!response.ok) {
      throw errorFromResponse(value, response.status);
    }
    return RevisionHistoryResponseSchema.parse(value).revisions;
  }
  async load(
    key: RevisionKey,
    signal?: AbortSignal
  ): Promise<AnalysisResponse> {
    const query = new URLSearchParams(key);
    return AnalysisGateway.parseAnalysis(
      await this.fetcher(`/api/analysis?${query}`, { signal })
    );
  }
}
export type AnalysisGatewayPort = Pick<
  AnalysisGateway,
  "listFiles" | "analyse" | "listRevisions" | "load"
>;
