import { PiRequest, PiResult } from "./runtime-types";

export interface AgentRuntime {
  resolveModel(pattern: string): readonly [string, string];
  assertCredential(provider: string): void;
  contextWindow(provider: string, id: string): number;
  run(
    request: PiRequest,
    onEvent?: (event: any) => void,
    onSpawn?: (pid: number) => void,
    onExit?: (pid: number) => void,
  ): Promise<PiResult>;
}
