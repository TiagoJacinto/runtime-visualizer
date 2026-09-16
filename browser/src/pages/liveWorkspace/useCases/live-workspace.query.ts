import type {
  ActiveExecution,
  AnalysisResponse,
  ExecutionUpdate,
  RevisionKey,
  RevisionSummary,
  WorkspaceEvent,
} from "@runtime-visualizer/contracts";
import { QueryClient, keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  QueryClientConfig,
  QueryFunctionContext,
} from "@tanstack/react-query";

import type { AnalysisGatewayPort } from "../../../shared/api/analysis-gateway";
import type { ExecutionGatewayPort } from "../../../shared/api/execution-gateway";
import { executionRecordFromActive } from "./live-workspace.types";
import type {
  ExecutionRecord,
  LiveWorkspaceState,
  LiveWorkspaceView,
  WorkspaceResourceState,
} from "./live-workspace.types";

const queryRoot = ["live-workspace"] as const;

export const liveWorkspaceQueryKeys = {
  activeExecutions: () => [...queryRoot, "active-executions"] as const,
  all: queryRoot,
  analysis: (key: RevisionKey) =>
    [
      ...queryRoot,
      "analysis",
      key.file,
      key.procedureId,
      key.revision,
    ] as const,
  currentAnalysis: (file: string, procedureId?: string) =>
    [...queryRoot, "current-analysis", file, procedureId ?? ""] as const,
  files: () => [...queryRoot, "files"] as const,
  revisions: (scope?: Pick<RevisionKey, "file" | "procedureId">) =>
    scope
      ? ([...queryRoot, "revisions", scope.file, scope.procedureId] as const)
      : ([...queryRoot, "revisions"] as const),
};

interface WorkspaceQueryOptions<T> {
  queryKey: readonly unknown[];
  queryFn: (context: QueryFunctionContext) => Promise<T>;
  staleTime?: number;
}

export interface LiveWorkspaceQueries {
  readonly client: QueryClient;
  readonly options: {
    files: () => WorkspaceQueryOptions<readonly string[]>;
    currentAnalysis: (
      file: string,
      procedureId?: string
    ) => WorkspaceQueryOptions<AnalysisResponse>;
    analysis: (key: RevisionKey) => WorkspaceQueryOptions<AnalysisResponse>;
    revisions: (
      scope: Pick<RevisionKey, "file" | "procedureId">
    ) => WorkspaceQueryOptions<readonly RevisionSummary[]>;
    activeExecutions: () => WorkspaceQueryOptions<readonly ActiveExecution[]>;
  };
  fetchFiles: () => Promise<readonly string[]>;
  fetchCurrentAnalysis: (
    file: string,
    procedureId?: string
  ) => Promise<AnalysisResponse>;
  fetchAnalysis: (key: RevisionKey) => Promise<AnalysisResponse>;
  fetchRevisions: (
    scope: Pick<RevisionKey, "file" | "procedureId">
  ) => Promise<readonly RevisionSummary[]>;
  fetchActiveExecutions: () => Promise<readonly ActiveExecution[]>;
  startExecution: (scope: RevisionKey) => Promise<ActiveExecution>;
  cancelExecution: (executionId: string) => Promise<void>;
  getFiles: () => readonly string[] | undefined;
  getAnalysis: (key: RevisionKey) => AnalysisResponse | undefined;
  getRevisions: (
    scope: Pick<RevisionKey, "file" | "procedureId">
  ) => readonly RevisionSummary[] | undefined;
  getActiveExecutions: () => readonly ActiveExecution[];
  applyWorkspaceEvent: (event: WorkspaceEvent) => {
    terminal?: ExecutionUpdate;
  };
  invalidateFiles: () => Promise<void>;
  invalidateCurrentAnalysis: (file: string) => Promise<void>;
  invalidateRevisions: (
    scope?: Pick<RevisionKey, "file" | "procedureId">
  ) => Promise<void>;
  invalidateActiveExecutions: () => Promise<void>;
  invalidateMutableResources: () => Promise<void>;
}

export interface UseLiveWorkspaceResourcesResult {
  files: readonly string[];
  filesLoading: boolean;
  filesError: string | null;
  analysis: AnalysisResponse | null;
  analysisStatus: WorkspaceResourceState["analysisStatus"];
  analysisError: string | null;
  revisions: readonly RevisionSummary[];
  activeExecutions: readonly ExecutionRecord[];
}

// SAFETY: query libraries expose Error values at this rendering boundary.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
const queryErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Workspace resource unavailable";

const toActiveExecution = (
  update: ExecutionUpdate,
  previous: ActiveExecution | undefined
): ActiveExecution => ({
  currentNodeId: update.currentNodeId,
  displayNumber: update.displayNumber,
  executionId: update.executionId,
  scope: update.scope,
  startedAt: previous?.startedAt ?? new Date().toISOString(),
  status: "Running",
});

const sortActiveExecutions = (
  executions: readonly ExecutionRecord[]
): readonly ExecutionRecord[] =>
  executions.toSorted((a, b) => {
    if (a.displayNumber !== undefined && b.displayNumber !== undefined) {
      return b.displayNumber - a.displayNumber;
    }
    return (b.startedAt ?? "").localeCompare(a.startedAt ?? "");
  });

const makeQueryClient = (config?: QueryClientConfig): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      ...config?.defaultOptions,
    },
    ...config,
  });

export const createLiveWorkspaceQueries = (
  ports: {
    analysis: AnalysisGatewayPort;
    execution: ExecutionGatewayPort;
  },
  client = makeQueryClient()
): LiveWorkspaceQueries => {
  const filesOptions = () => ({
    queryFn: ({ signal }) => ports.analysis.listFiles(signal),
    queryKey: liveWorkspaceQueryKeys.files(),
    staleTime: 30_000,
  });
  const currentAnalysisOptions = (file: string, procedureId?: string) => ({
    queryFn: ({ signal }) => ports.analysis.analyse(file, procedureId, signal),
    queryKey: liveWorkspaceQueryKeys.currentAnalysis(file, procedureId),
    staleTime: 0,
  });
  const analysisOptions = (key: RevisionKey) => ({
    queryFn: ({ signal }) => ports.analysis.load(key, signal),
    queryKey: liveWorkspaceQueryKeys.analysis(key),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const revisionsOptions = (
    scope: Pick<RevisionKey, "file" | "procedureId">
  ) => ({
    queryFn: ({ signal }) => ports.analysis.listRevisions(scope, signal),
    queryKey: liveWorkspaceQueryKeys.revisions(scope),
    staleTime: 0,
  });
  const activeExecutionsOptions = () => ({
    queryFn: ({ signal }) =>
      ports.execution.list?.(signal) ?? Promise.resolve([]),
    queryKey: liveWorkspaceQueryKeys.activeExecutions(),
    staleTime: 0,
  });
  const setActiveExecutions = (
    executions: readonly ActiveExecution[]
  ): void => {
    client.setQueryData<readonly ActiveExecution[]>(
      liveWorkspaceQueryKeys.activeExecutions(),
      executions
    );
  };
  const invalidateMutableResources = async (): Promise<void> => {
    await Promise.all([
      client.invalidateQueries({ queryKey: liveWorkspaceQueryKeys.files() }),
      client.invalidateQueries({
        queryKey: [...queryRoot, "current-analysis"],
      }),
      client.invalidateQueries({ queryKey: [...queryRoot, "revisions"] }),
      client.invalidateQueries({
        queryKey: liveWorkspaceQueryKeys.activeExecutions(),
      }),
    ]);
  };

  const options = {
    activeExecutions: activeExecutionsOptions,
    analysis: analysisOptions,
    currentAnalysis: currentAnalysisOptions,
    files: filesOptions,
    revisions: revisionsOptions,
  };

  return {
    applyWorkspaceEvent: (event) => {
      if (event.type === "active-executions") {
        setActiveExecutions(event.executions);
        return {};
      }
      if (event.type === "execution-update") {
        const previous = client
          .getQueryData<readonly ActiveExecution[]>(
            liveWorkspaceQueryKeys.activeExecutions()
          )
          ?.find(
            (execution) => execution.executionId === event.update.executionId
          );
        const executions = [
          ...(client.getQueryData<readonly ActiveExecution[]>(
            liveWorkspaceQueryKeys.activeExecutions()
          ) ?? []),
        ].filter(
          (execution) => execution.executionId !== event.update.executionId
        );
        if (event.update.status === "Running") {
          executions.push(toActiveExecution(event.update, previous));
        }
        setActiveExecutions(executions);
        return event.update.status === "Running"
          ? {}
          : { terminal: event.update };
      }
      if (event.type === "source-change") {
        const { change } = event;
        if (change.change === "added") {
          const files = client.getQueryData<readonly string[]>(
            liveWorkspaceQueryKeys.files()
          );
          if (files !== undefined && !files.includes(change.file)) {
            client.setQueryData(
              liveWorkspaceQueryKeys.files(),
              [...files, change.file].toSorted((a, b) => a.localeCompare(b))
            );
          } else if (files === undefined) {
            void client.invalidateQueries({
              queryKey: liveWorkspaceQueryKeys.files(),
            });
          }
        } else if (change.change === "deleted") {
          const files = client.getQueryData<readonly string[]>(
            liveWorkspaceQueryKeys.files()
          );
          if (files === undefined) {
            void client.invalidateQueries({
              queryKey: liveWorkspaceQueryKeys.files(),
            });
          } else {
            client.setQueryData(
              liveWorkspaceQueryKeys.files(),
              files.filter((file) => file !== change.file)
            );
          }
        } else {
          void client.invalidateQueries({
            queryKey: [...queryRoot, "revisions", change.file],
          });
          void client.invalidateQueries({
            queryKey: [...queryRoot, "current-analysis", change.file],
          });
        }
        return {};
      }
      if (event.type === "revision-ready") {
        void client.invalidateQueries({
          queryKey: liveWorkspaceQueryKeys.revisions(event.revision),
        });
        return {};
      }
      if (event.type === "revision-build-failed") {
        void client.invalidateQueries({
          queryKey: liveWorkspaceQueryKeys.revisions(),
        });
        return {};
      }
      if (event.type === "resync-required") {
        void invalidateMutableResources();
      }
      return {};
    },
    cancelExecution: async (executionId) => {
      if (ports.execution.cancel === undefined) {
        throw new Error("Execution cancellation is unavailable");
      }
      await ports.execution.cancel(executionId);
    },
    client,
    fetchActiveExecutions: () => client.fetchQuery(options.activeExecutions()),
    fetchAnalysis: (key) => client.fetchQuery(options.analysis(key)),
    fetchCurrentAnalysis: async (file, procedureId) => {
      const analysis = await client.fetchQuery(
        options.currentAnalysis(file, procedureId)
      );
      client.setQueryData(liveWorkspaceQueryKeys.analysis(analysis), analysis);
      return analysis;
    },
    fetchFiles: () => client.fetchQuery(options.files()),
    fetchRevisions: (scope) => client.fetchQuery(options.revisions(scope)),
    getActiveExecutions: () =>
      client.getQueryData<readonly ActiveExecution[]>(
        liveWorkspaceQueryKeys.activeExecutions()
      ) ?? [],
    getAnalysis: (key) =>
      client.getQueryData<AnalysisResponse>(
        liveWorkspaceQueryKeys.analysis(key)
      ),
    getFiles: () =>
      client.getQueryData<readonly string[]>(liveWorkspaceQueryKeys.files()),
    getRevisions: (scope) =>
      client.getQueryData<readonly RevisionSummary[]>(
        liveWorkspaceQueryKeys.revisions(scope)
      ),
    invalidateActiveExecutions: () =>
      client.invalidateQueries({
        queryKey: liveWorkspaceQueryKeys.activeExecutions(),
      }),
    invalidateCurrentAnalysis: (file) =>
      client.invalidateQueries({
        queryKey: [...queryRoot, "current-analysis", file],
      }),
    invalidateFiles: () =>
      client.invalidateQueries({ queryKey: liveWorkspaceQueryKeys.files() }),
    invalidateMutableResources,
    invalidateRevisions: (scope) =>
      client.invalidateQueries({
        queryKey: scope
          ? liveWorkspaceQueryKeys.revisions(scope)
          : [...queryRoot, "revisions"],
      }),
    options,
    startExecution: async (scope) => {
      const executionId = await ports.execution.start(scope);
      const executions =
        client.getQueryData<readonly ActiveExecution[]>(
          liveWorkspaceQueryKeys.activeExecutions()
        ) ?? [];
      const displayNumber =
        Math.max(0, ...executions.map((execution) => execution.displayNumber)) +
        1;
      const execution: ActiveExecution = {
        currentNodeId: null,
        displayNumber,
        executionId,
        scope,
        startedAt: new Date().toISOString(),
        status: "Running",
      };
      setActiveExecutions([...executions, execution]);
      return execution;
    },
  };
};

export const useLiveWorkspaceResources = (
  queries: LiveWorkspaceQueries,
  selectedScope: RevisionKey | null
): UseLiveWorkspaceResourcesResult => {
  const filesQuery = useQuery(queries.options.files(), queries.client);
  const analysisQuery = useQuery<AnalysisResponse, Error>(
    {
      ...(selectedScope === null
        ? {
            queryFn: () =>
              Promise.reject(new Error("No analysis scope selected")),
            queryKey: [...queryRoot, "analysis", "none"],
          }
        : queries.options.analysis(selectedScope)),
      enabled: selectedScope !== null,
      placeholderData: keepPreviousData,
    },
    queries.client
  );
  const revisionsQuery = useQuery<readonly RevisionSummary[], Error>(
    {
      ...(selectedScope === null
        ? {
            queryFn: () => Promise.resolve([]),
            queryKey: [...queryRoot, "revisions", "none"],
          }
        : queries.options.revisions(selectedScope)),
      enabled: selectedScope !== null,
    },
    queries.client
  );
  const activeExecutionsQuery = useQuery(
    queries.options.activeExecutions(),
    queries.client
  );
  const analysis = analysisQuery.data ?? null;
  let analysisStatus: WorkspaceResourceState["analysisStatus"] = "empty";
  if (analysisQuery.isError) {
    analysisStatus = "failed";
  } else if (analysisQuery.isFetching || analysisQuery.isPending) {
    analysisStatus = "loading";
  } else if (analysis !== null) {
    analysisStatus = "ready";
  }
  return {
    activeExecutions: sortActiveExecutions(
      (activeExecutionsQuery.data ?? queries.getActiveExecutions()).map(
        executionRecordFromActive
      )
    ),
    analysis,
    analysisError: analysisQuery.error
      ? queryErrorMessage(analysisQuery.error)
      : null,
    analysisStatus,
    files: filesQuery.data ?? [],
    filesError: filesQuery.error ? queryErrorMessage(filesQuery.error) : null,
    filesLoading: filesQuery.isPending || filesQuery.isFetching,
    revisions: revisionsQuery.data ?? [],
  };
};

export const projectLiveWorkspaceView = (
  state: LiveWorkspaceState,
  resources: UseLiveWorkspaceResourcesResult
): LiveWorkspaceView => {
  const { activeExecutions } = resources;
  const executions = sortActiveExecutions([
    ...activeExecutions,
    ...state.completedExecutions,
  ]);
  const { analysis } = resources;
  const analysisError = resources.analysisError ?? resources.filesError;
  const error = state.errorMessage ?? analysisError;
  let pane: LiveWorkspaceView["pane"];
  if (resources.analysisStatus === "ready" && analysis !== null) {
    pane = { status: "ready", value: analysis };
  } else if (resources.analysisStatus === "failed") {
    pane = {
      error: analysisError ?? "Analysis unavailable.",
      previous: analysis ?? undefined,
      status: "failed",
    };
  } else if (resources.analysisStatus === "loading") {
    pane = { previous: analysis ?? undefined, status: "loading" };
  } else {
    pane = { status: "empty" };
  }
  let status: LiveWorkspaceView["status"] = "loading";
  if (!resources.filesLoading && resources.files.length === 0) {
    status = "empty";
  } else if (resources.analysisStatus === "ready") {
    status = "ready";
  } else if (resources.analysisStatus === "failed" || error !== null) {
    status = "error";
  }
  return {
    ...state,
    activeExecutions,
    analysis,
    connection: state.connectionState.status,
    error,
    executions,
    files: resources.files,
    pane,
    revisions: resources.revisions,
    selectedFile: state.selectedScope?.file ?? null,
    selectedProcedure: state.selectedScope?.procedureId ?? null,
    status,
  };
};
