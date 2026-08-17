import type { FileChangeEvent } from "@runtime-visualizer/contracts";
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
import type { RetryScheduler } from "../../../shared/retry/retryScheduler";

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 250;
const MAX_RECONNECT_DELAY_MS = 4_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Backend unavailable";
}

function procedureName(
  analysis: NonNullable<LiveWorkspaceState["analysis"]>,
): string | undefined {
  return analysis.procedure.name ?? undefined;
}

function requestedProcedure(
  analysis: LiveWorkspaceState["analysis"],
  procedure: string | undefined,
): string | undefined {
  if (
    analysis?.procedure.kind === "TopLevel" &&
    procedure === analysis.procedure.label
  )
    return undefined;
  return procedure;
}

function defaultRetryScheduler(): RetryScheduler {
  return {
    schedule(delayMs, task) {
      const handle = globalThis.setTimeout(task, delayMs);
      return () => globalThis.clearTimeout(handle);
    },
  };
}

export function createLiveWorkspaceController(
  ports: LiveWorkspacePorts,
): WorkspaceController {
  let state: LiveWorkspaceState = initialLiveWorkspaceState;
  let request = 0;
  let controller: AbortController | undefined;
  let eventsController: AbortController | undefined;
  let reconnectCancel: (() => void) | undefined;
  let disposed = false;
  let started = false;
  let reconnectAttempt = 0;
  const retry = ports.retry ?? defaultRetryScheduler();
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

  const matchingActiveExecution = (): boolean => {
    if (state.analysis === null) return false;
    return state.executions.some(
      (execution) =>
        execution.status === "running" &&
        execution.file === state.analysis?.file &&
        execution.revision === state.analysis.revision &&
        execution.procedure === state.analysis.procedure.name,
    );
  };

  const refreshQueued = (): void => {
    if (matchingActiveExecution()) return;
    if (state.fileDeleted) {
      const nextFile = state.files[0];
      if (nextFile === undefined) {
        set({ ...state, status: "empty", selectedFile: null, selectedProcedure: null, analysis: null, fileDeleted: false });
      } else {
        void load(nextFile);
      }
      return;
    }
    if (state.queuedRevision === null || state.selectedFile === null) return;
    void load(state.selectedFile, state.selectedProcedure ?? undefined);
  };

  const load = async (file: string, procedure?: string): Promise<void> => {
    const id = ++request;
    const procedureForRequest = requestedProcedure(state.analysis, procedure);
    controller?.abort();
    controller = new AbortController();
    set({
      ...state,
      status: "loading",
      selectedFile: file,
      selectedProcedure: procedure ?? null,
      analysis: null,
      error: null,
      queuedRevision: null,
      fileDeleted: false,
    });
    try {
      const analysis = await ports.analysis.analyse(
        file,
        procedureForRequest,
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
        queuedRevision: null,
        fileDeleted: false,
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

  const loadFiles = async (forceAnalysis = false): Promise<void> => {
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
          queuedRevision: null,
          fileDeleted: false,
        });
        return;
      }
      const selected = state.selectedFile && files.includes(state.selectedFile)
        ? state.selectedFile
        : files[0];
      set({
        ...state,
        status: "loading",
        files,
        selectedFile: selected,
        error: null,
      });
      if (forceAnalysis || state.analysis === null || selected !== state.analysis.file)
        await load(selected, selected === state.selectedFile ? state.selectedProcedure ?? undefined : undefined);
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
    refreshQueued();
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
      refreshQueued();
    }
  };

  const handleFileChange = (event: FileChangeEvent): void => {
    if (event.change === "added") {
      if (!state.files.includes(event.file))
        set({ ...state, files: [...state.files, event.file].sort() });
      return;
    }
    if (event.change === "deleted") {
      const files = state.files.filter((file) => file !== event.file);
      if (event.file !== state.selectedFile) {
        set({ ...state, files });
        return;
      }
      if (matchingActiveExecution()) {
        set({ ...state, files, fileDeleted: true, error: "File deleted" });
        return;
      }
      const nextFile = files[0];
      if (nextFile === undefined) {
        set({ ...state, status: "empty", files, selectedFile: null, selectedProcedure: null, analysis: null });
      } else {
        set({ ...state, files });
        void load(nextFile);
      }
      return;
    }
    if (event.file !== state.selectedFile || event.revision === undefined) return;
    if (matchingActiveExecution()) {
      set({ ...state, queuedRevision: event.revision, error: null });
      return;
    }
    void load(event.file, state.selectedProcedure ?? undefined);
  };

  const scheduleReconnect = (): void => {
    if (disposed || reconnectCancel !== undefined) return;
    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) return;
    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempt,
      MAX_RECONNECT_DELAY_MS,
    );
    reconnectAttempt += 1;
    reconnectCancel = retry.schedule(delay, () => {
      reconnectCancel = undefined;
      void observeFileChanges();
    });
  };

  const observeFileChanges = async (): Promise<void> => {
    if (disposed || ports.fileEvents === undefined) return;
    eventsController?.abort();
    const events = new AbortController();
    eventsController = events;
    const wasReconnecting = state.connection === "reconnecting";
    try {
      set({ ...state, connection: "connected", error: null });
      reconnectAttempt = 0;
      for await (const event of ports.fileEvents.subscribe(events.signal)) {
        if (disposed) return;
        handleFileChange(event);
      }
      if (disposed || events.signal.aborted) return;
      throw new Error("File event connection ended");
    } catch (error) {
      if (disposed || events.signal.aborted) return;
      set({ ...state, connection: "reconnecting", error: errorMessage(error) });
      scheduleReconnect();
      return;
    } finally {
      if (eventsController === events) eventsController = undefined;
      if (wasReconnecting && !disposed) void loadFiles(true);
    }
  };

  const runProcedure = async (): Promise<void> => {
    const analysis = state.analysis;
    if (
      analysis?.cfg === null ||
      analysis === null ||
      state.selectedFile === null ||
      state.connection === "reconnecting" ||
      state.fileDeleted
    )
      return;
    let stream: Awaited<ReturnType<LiveWorkspacePorts["execution"]["start"]>>;
    try {
      stream = await ports.execution.start({
        file: analysis.file,
        ...(procedureName(analysis) === undefined ? {} : { name: procedureName(analysis) }),
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
      void observeFileChanges();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    selectFile: (file) => {
      if (state.connection === "reconnecting") return;
      if (state.files.includes(file)) void load(file);
    },
    selectProcedure: (name) => {
      if (state.connection === "reconnecting") return;
      if (state.selectedFile) void load(state.selectedFile, name);
    },
    runProcedure: () => void runProcedure(),
    selectExecution: (executionId) => {
      const execution = state.executions.find((item) => item.executionId === executionId);
      if (!execution) return;
      const analysis = Object.values(state.snapshots).find(
        (item) => item.file === execution.file && item.revision === execution.revision && (item.procedure.name ?? null) === execution.procedure,
      );
      if (!analysis) return;
      set({ ...state, selectedExecutionId: executionId, selectedFile: analysis.file, selectedProcedure: analysis.procedure.name ?? analysis.procedure.label, analysis });
    },
    clearCompleted: () => {
      const executions = state.executions.filter((execution) => execution.status === "running");
      const referenced = new Set(Object.entries(state.snapshots).filter(([, snapshot]) => executions.some((execution) => snapshot.file === execution.file && snapshot.revision === execution.revision && (snapshot.procedure.name ?? null) === execution.procedure)).map(([key]) => key));
      const snapshots = Object.fromEntries(Object.entries(state.snapshots).filter(([key]) => referenced.has(key) || (state.analysis !== null && key === snapshotKey(state.analysis))));
      set({ ...state, executions, snapshots, selectedExecutionId: executions.some((item) => item.executionId === state.selectedExecutionId) ? state.selectedExecutionId : null });
    },
    retry: () => {
      reconnectCancel?.();
      reconnectCancel = undefined;
      reconnectAttempt = 0;
      if (state.selectedFile) void load(state.selectedFile, state.selectedProcedure ?? undefined);
      else void loadFiles();
      void observeFileChanges();
    },
    dispose: () => {
      disposed = true;
      started = false;
      request++;
      controller?.abort();
      eventsController?.abort();
      reconnectCancel?.();
      reconnectCancel = undefined;
      for (const cancel of streams.values()) cancel();
      streams.clear();
      listeners.clear();
    },
  };
}
