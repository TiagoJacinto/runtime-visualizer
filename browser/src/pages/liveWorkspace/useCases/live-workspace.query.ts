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
const projectQueryRoot = (projectId?: string) =>
  projectId === undefined ? queryRoot : ([...queryRoot, projectId] as const);

export const liveWorkspaceQueryKeys = {
  activeExecutions: (projectId?: string) =>
    [...projectQueryRoot(projectId), "active-executions"] as const,
  all: queryRoot,
  analysis: (key: RevisionKey, projectId?: string) =>
    [
      ...projectQueryRoot(projectId),
      "analysis",
      key.file,
      key.procedureId,
      key.revision,
    ] as const,
  currentAnalysis: (file: string, procedureId?: string, projectId?: string) =>
    [...projectQueryRoot(projectId), "current-analysis", file, procedureId ?? ""] as const,
  files: (projectId?: string) => [...projectQueryRoot(projectId), "files"] as const,
  project: projectQueryRoot,
  revisions: (scope?: Pick<RevisionKey, "file" | "procedureId">, projectId?: string) =>
    scope
      ? ([...projectQueryRoot(projectId), "revisions", scope.file, scope.procedureId] as const)
      : ([...projectQueryRoot(projectId), "revisions"] as const),
};

interface WorkspaceQueryOptions<T> {
  queryKey: readonly unknown[];
  queryFn: (context: QueryFunctionContext) => Promise<T>;
  staleTime?: number;
}

export interface LiveWorkspaceQueries {
  readonly client: QueryClient;
  readonly projectId?: string;
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
    projectId?: string;
  },
  client = makeQueryClient()
): LiveWorkspaceQueries => {
  const { projectId } = ports;
  const filesOptions = () => ({
    // Keep this small bootstrap query alive through StrictMode's development
    // observer cycle so the result can populate the shared query cache.
    queryFn: () => ports.analysis.listFiles(),
    queryKey: liveWorkspaceQueryKeys.files(projectId),
    staleTime: 30_000,
  });
  const currentAnalysisOptions = (file: string, procedureId?: string) => ({
    queryFn: ({ signal }) => ports.analysis.analyse(file, procedureId, signal),
    queryKey: liveWorkspaceQueryKeys.currentAnalysis(file, procedureId, projectId),
    staleTime: 0,
  });
  const analysisOptions = (key: RevisionKey) => ({
    queryFn: ({ signal }) => ports.analysis.load(key, signal),
    queryKey: liveWorkspaceQueryKeys.analysis(key, projectId),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const revisionsOptions = (
    scope: Pick<RevisionKey, "file" | "procedureId">
  ) => ({
    queryFn: ({ signal }) => ports.analysis.listRevisions(scope, signal),
    queryKey: liveWorkspaceQueryKeys.revisions(scope, projectId),
    staleTime: 0,
  });
  const activeExecutionsOptions = () => ({
    // Keep this small bootstrap query alive through StrictMode's development
    // observer cycle so the result can populate the shared query cache.
    queryFn: () => ports.execution.list?.() ?? Promise.resolve([]),
    queryKey: liveWorkspaceQueryKeys.activeExecutions(projectId),
    staleTime: 0,
  });
  const setActiveExecutions = (
    executions: readonly ActiveExecution[]
  ): void => {
    client.setQueryData<readonly ActiveExecution[]>(
      liveWorkspaceQueryKeys.activeExecutions(projectId),
      executions
    );
  };
  const invalidateMutableResources = async (): Promise<void> => {
    await Promise.all([
      client.invalidateQueries({ queryKey: liveWorkspaceQueryKeys.files(projectId) }),
      client.invalidateQueries({
        queryKey: [...liveWorkspaceQueryKeys.project(projectId), "current-analysis"],
      }),
      client.invalidateQueries({
        queryKey: [...liveWorkspaceQueryKeys.project(projectId), "revisions"],
      }),
      client.invalidateQueries({
        queryKey: liveWorkspaceQueryKeys.activeExecutions(projectId),
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
            liveWorkspaceQueryKeys.activeExecutions(projectId)
          )
          ?.find(
            (execution) => execution.executionId === event.update.executionId
          );
        const executions = [
          ...(client.getQueryData<readonly ActiveExecution[]>(
            liveWorkspaceQueryKeys.activeExecutions(projectId)
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
            liveWorkspaceQueryKeys.files(projectId)
          );
          if (files !== undefined && !files.includes(change.file)) {
            client.setQueryData(
              liveWorkspaceQueryKeys.files(projectId),
              [...files, change.file].toSorted((a, b) => a.localeCompare(b))
            );
          } else if (files === undefined) {
            void client.invalidateQueries({
              queryKey: liveWorkspaceQueryKeys.files(projectId),
            });
          }
        } else if (change.change === "deleted") {
          const files = client.getQueryData<readonly string[]>(
            liveWorkspaceQueryKeys.files(projectId)
          );
          if (files === undefined) {
            void client.invalidateQueries({
              queryKey: liveWorkspaceQueryKeys.files(projectId),
            });
          } else {
            client.setQueryData(
              liveWorkspaceQueryKeys.files(projectId),
              files.filter((file) => file !== change.file)
            );
          }
        } else {
          void client.invalidateQueries({
            queryKey: [...liveWorkspaceQueryKeys.project(projectId), "revisions", change.file],
          });
          void client.invalidateQueries({
            queryKey: [...liveWorkspaceQueryKeys.project(projectId), "current-analysis", change.file],
          });
        }
        return {};
      }
      if (event.type === "revision-ready") {
        void client.invalidateQueries({
          queryKey: liveWorkspaceQueryKeys.revisions(event.revision, projectId),
        });
        return {};
      }
      if (event.type === "revision-build-failed") {
        void client.invalidateQueries({
          queryKey: liveWorkspaceQueryKeys.revisions(undefined, projectId),
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
      client.setQueryData(liveWorkspaceQueryKeys.analysis(analysis, projectId), analysis);
      return analysis;
    },
    fetchFiles: () => client.fetchQuery(options.files()),
    fetchRevisions: (scope) => client.fetchQuery(options.revisions(scope)),
    getActiveExecutions: () =>
      client.getQueryData<readonly ActiveExecution[]>(
        liveWorkspaceQueryKeys.activeExecutions(projectId)
      ) ?? [],
    getAnalysis: (key) =>
      client.getQueryData<AnalysisResponse>(
        liveWorkspaceQueryKeys.analysis(key, projectId)
      ),
    getFiles: () =>
      client.getQueryData<readonly string[]>(liveWorkspaceQueryKeys.files(projectId)),
    getRevisions: (scope) =>
      client.getQueryData<readonly RevisionSummary[]>(
        liveWorkspaceQueryKeys.revisions(scope, projectId)
      ),
    invalidateActiveExecutions: () =>
      client.invalidateQueries({
        queryKey: liveWorkspaceQueryKeys.activeExecutions(projectId),
      }),
    invalidateCurrentAnalysis: (file) =>
      client.invalidateQueries({
        queryKey: [
          ...liveWorkspaceQueryKeys.project(projectId),
          "current-analysis",
          file,
        ],
      }),
    invalidateFiles: () =>
      client.invalidateQueries({ queryKey: liveWorkspaceQueryKeys.files(projectId) }),
    invalidateMutableResources,
    invalidateRevisions: (scope) =>
      client.invalidateQueries({
        queryKey: scope
          ? liveWorkspaceQueryKeys.revisions(scope, projectId)
          : liveWorkspaceQueryKeys.revisions(undefined, projectId),
      }),
    options,
    projectId,
    startExecution: async (scope) => {
      const executionId = await ports.execution.start(scope);
      const executions =
        client.getQueryData<readonly ActiveExecution[]>(
          liveWorkspaceQueryKeys.activeExecutions(projectId)
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
            queryKey: [...projectQueryRoot(queries.projectId), "analysis", "none"],
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
            queryKey: [...projectQueryRoot(queries.projectId), "revisions", "none"],
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
  const selectedScope =
    state.selection.status === "selected" ? state.selection.scope : null;
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
    selectedFile: selectedScope?.file ?? null,
    selectedProcedure: selectedScope?.procedureId ?? null,
    selectedScope,
    status,
  };
};
