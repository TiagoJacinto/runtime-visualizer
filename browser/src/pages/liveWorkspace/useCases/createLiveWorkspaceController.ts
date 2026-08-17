import {
  initialLiveWorkspaceState,
  snapshotKey,
  type ExecutionRecord,
  type LiveWorkspaceState,
} from "./liveWorkspace.types";
import type {
  LiveWorkspacePorts,
  WorkspaceController,
} from "./liveWorkspace.ports";
import { publish } from "./liveWorkspace.state";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Backend unavailable";
}

function procedureName(
  analysis: NonNullable<LiveWorkspaceState["analysis"]>,
): string | undefined {
  return analysis.procedure.name ?? undefined;
}

export function createLiveWorkspaceController(
  ports: LiveWorkspacePorts,
): WorkspaceController {
  let state: LiveWorkspaceState = initialLiveWorkspaceState;
  let request = 0;
  let controller: AbortController | undefined;
  let disposed = false;
  let started = false;
  const streams = new Map<string, () => void>();
  const listeners = new Set<(state: LiveWorkspaceState) => void>();

  const set = (next: LiveWorkspaceState): void => {
    if (disposed) return;
    state = next;
    publish(listeners, state);
  };

  const storeAnalysis = (
    analysis: NonNullable<LiveWorkspaceState["analysis"]>,
  ): Readonly<Record<string, NonNullable<LiveWorkspaceState["analysis"]>>> => ({
    ...state.snapshots,
    [snapshotKey(analysis)]: analysis,
  });

  const load = async (file: string, procedure?: string): Promise<void> => {
    const id = ++request;
    controller?.abort();
    controller = new AbortController();
    set({
      ...state,
      status: "loading",
      selectedFile: file,
      selectedProcedure: procedure ?? null,
      analysis: null,
      error: null,
    });
    try {
      const analysis = await ports.analysis.analyse(
        file,
        procedure,
        controller.signal,
      );
      if (disposed || id !== request) return;
      set({
        ...state,
        status: "ready",
        analysis,
        snapshots: storeAnalysis(analysis),
        selectedFile: analysis.file,
        selectedProcedure: analysis.procedure.name ?? analysis.procedure.label,
        error: null,
      });
    } catch (error) {
      if (disposed || id !== request || controller.signal.aborted) return;
      set({
        ...state,
        status: "error",
        analysis: null,
        error: errorMessage(error),
      });
    }
  };

  const loadFiles = async (): Promise<void> => {
    try {
      const files = await ports.analysis.listFiles();
      if (disposed) return;
      if (files.length === 0) {
        set({
          ...state,
          status: "empty",
          files,
          selectedFile: null,
          selectedProcedure: null,
          analysis: null,
        });
        return;
      }
      set({
        ...state,
        status: "loading",
        files,
        selectedFile: files[0],
        error: null,
      });
      await load(files[0]);
    } catch (error) {
      if (!disposed)
        set({ ...state, status: "error", error: errorMessage(error) });
    }
  };

  const updateExecution = (
    executionId: string,
    update: Partial<ExecutionRecord>,
  ): void => {
    const executions = state.executions.map((execution) =>
      execution.executionId === executionId
        ? { ...execution, ...update }
        : execution,
    );
    set({ ...state, executions });
  };

  const observeExecution = async (
    executionId: string,
    stream: Awaited<ReturnType<LiveWorkspacePorts["execution"]["start"]>>,
  ): Promise<void> => {
    let terminal = false;
    try {
      for await (const event of stream.events) {
        if (disposed) return;
        if (event.event === "node") {
          updateExecution(executionId, { currentNodeId: event.data.nodeId });
        } else {
          terminal = true;
          updateExecution(executionId, {
            status: event.data.status === "Succeeded" ? "succeeded" : "failed",
            currentNodeId: null,
            error: event.data.error ?? null,
          });
        }
      }
      if (!terminal && !disposed)
        updateExecution(executionId, {
          status: "interrupted",
          currentNodeId: null,
          error: "Execution stream ended before a result.",
        });
    } catch (error) {
      if (!disposed)
        updateExecution(executionId, {
          status: "interrupted",
          currentNodeId: null,
          error: errorMessage(error),
        });
    } finally {
      streams.delete(executionId);
    }
  };

  const runProcedure = async (): Promise<void> => {
    const analysis = state.analysis;
    if (
      analysis?.cfg === null ||
      analysis === null ||
      state.selectedFile === null
    )
      return;
    let stream: Awaited<ReturnType<LiveWorkspacePorts["execution"]["start"]>>;
    try {
      stream = await ports.execution.start({
        file: analysis.file,
        ...(procedureName(analysis) === undefined
          ? {}
          : { name: procedureName(analysis) }),
        revision: analysis.revision,
      });
    } catch (error) {
      if (!disposed) set({ ...state, error: errorMessage(error) });
      return;
    }
    if (disposed) {
      stream.cancel();
      return;
    }
    const execution: ExecutionRecord = {
      executionId: stream.executionId,
      file: analysis.file,
      procedure: analysis.procedure.name,
      revision: analysis.revision,
      status: "running",
      currentNodeId: null,
      error: null,
    };
    streams.set(stream.executionId, stream.cancel);
    set({
      ...state,
      executions: [...state.executions, execution],
      selectedExecutionId: stream.executionId,
    });
    void observeExecution(stream.executionId, stream);
  };

  return {
    getState: () => state,
    start: () => {
      if (started) return;
      disposed = false;
      started = true;
      void loadFiles();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    selectFile: (file) => {
      if (state.files.includes(file)) void load(file);
    },
    selectProcedure: (name) => {
      if (state.selectedFile) void load(state.selectedFile, name);
    },
    runProcedure: () => {
      void runProcedure();
    },
    selectExecution: (executionId) => {
      const execution = state.executions.find(
        (item) => item.executionId === executionId,
      );
      if (!execution) return;
      const analysis = Object.values(state.snapshots).find(
        (item) =>
          item.file === execution.file &&
          item.revision === execution.revision &&
          (item.procedure.name ?? null) === execution.procedure,
      );
      if (!analysis) return;
      set({
        ...state,
        selectedExecutionId: executionId,
        selectedFile: analysis.file,
        selectedProcedure: analysis.procedure.name ?? analysis.procedure.label,
        analysis,
      });
    },
    clearCompleted: () => {
      const executions = state.executions.filter(
        (execution) => execution.status === "running",
      );
      const referenced = new Set(
        Object.entries(state.snapshots)
          .filter(([, snapshot]) =>
            executions.some(
              (execution) =>
                snapshot.file === execution.file &&
                snapshot.revision === execution.revision &&
                (snapshot.procedure.name ?? null) === execution.procedure,
            ),
          )
          .map(([key]) => key),
      );
      const snapshots = Object.fromEntries(
        Object.entries(state.snapshots).filter(
          ([key]) =>
            referenced.has(key) ||
            (state.analysis !== null && key === snapshotKey(state.analysis)),
        ),
      );
      set({
        ...state,
        executions,
        snapshots,
        selectedExecutionId: executions.some(
          (item) => item.executionId === state.selectedExecutionId,
        )
          ? state.selectedExecutionId
          : null,
      });
    },
    retry: () => {
      if (state.selectedFile)
        void load(state.selectedFile, state.selectedProcedure ?? undefined);
      else void loadFiles();
    },
    dispose: () => {
      disposed = true;
      started = false;
      request++;
      controller?.abort();
      for (const cancel of streams.values()) cancel();
      streams.clear();
      listeners.clear();
    },
  };
}
