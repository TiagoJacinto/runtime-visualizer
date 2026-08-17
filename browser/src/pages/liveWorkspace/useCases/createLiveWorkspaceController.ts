import { initialLiveWorkspaceState, type LiveWorkspaceState } from "./liveWorkspace.types";
import type { LiveWorkspacePorts, WorkspaceController } from "./liveWorkspace.ports";
import { publish } from "./liveWorkspace.state";

export function createLiveWorkspaceController(ports: LiveWorkspacePorts): WorkspaceController {
  let state: LiveWorkspaceState = initialLiveWorkspaceState;
  let request = 0;
  let controller: AbortController | undefined;
  const listeners = new Set<(state: LiveWorkspaceState) => void>();
  const set = (next: LiveWorkspaceState) => { state = next; publish(listeners, state); };
  const load = async (file: string, procedure?: string) => {
    const id = ++request;
    controller?.abort(); controller = new AbortController();
    set({ ...state, status: "loading", selectedFile: file, selectedProcedure: procedure ?? null, error: null });
    try {
      const analysis = await ports.analysis.analyse(file, procedure, controller.signal);
      if (id !== request) return;
      set({ ...state, status: "ready", analysis, selectedFile: analysis.file, selectedProcedure: analysis.procedure.name ?? analysis.procedure.label, error: null });
    } catch (error) {
      if (id !== request || controller.signal.aborted) return;
      set({ ...state, status: "error", analysis: null, error: error instanceof Error ? error.message : "Backend unavailable" });
    }
  };
  const loadFiles = async () => {
    try {
      const files = await ports.analysis.listFiles();
      if (files.length === 0) { set({ ...state, status: "empty", files, selectedFile: null, selectedProcedure: null, analysis: null }); return; }
      set({ ...state, status: "loading", files, selectedFile: files[0] });
      await load(files[0]);
    } catch (error) { set({ ...state, status: "error", error: error instanceof Error ? error.message : "Backend unavailable" }); }
  };
  void loadFiles();
  return {
    getState: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    selectFile: (file) => { if (state.files.includes(file)) void load(file); },
    selectProcedure: (name) => { if (state.selectedFile) void load(state.selectedFile, name); },
    retry: () => { if (state.selectedFile) void load(state.selectedFile, state.selectedProcedure ?? undefined); else void loadFiles(); },
    dispose: () => { request++; controller?.abort(); listeners.clear(); },
  };
}
