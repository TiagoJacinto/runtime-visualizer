export interface CommandRequest {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly signal?: AbortSignal;
}

export interface CommandResult {
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly failure?: "timeout" | "canceled" | "exit" | "spawn";
}

export interface CommandRunnerPort {
  run(request: CommandRequest): Promise<CommandResult>;
}
