import { spawn } from "node:child_process";
import type { CommandRunnerPort } from "../../ports/command-runner";

export class LocalProcessAdapter implements CommandRunnerPort {
  async run(request: Parameters<CommandRunnerPort["run"]>[0]) {
    return new Promise<Awaited<ReturnType<CommandRunnerPort["run"]>>>(
      (resolve) => {
        let stdout = "";
        let stderr = "";
        let failure: "timeout" | "canceled" | "exit" | "spawn" | undefined;
        const child = spawn(request.command, [...(request.args ?? [])], {
          cwd: request.cwd,
          stdio: ["ignore", "pipe", "pipe"],
        });
        const limit = request.maxOutputBytes ?? 1_000_000;
        const append = (current: string, value: Buffer | string) =>
          (current + String(value)).slice(-limit);
        child.stdout?.on("data", (value) => {
          stdout = append(stdout, value);
        });
        child.stderr?.on("data", (value) => {
          stderr = append(stderr, value);
        });
        const timer =
          request.timeoutMs === undefined
            ? undefined
            : setTimeout(() => {
                failure = "timeout";
                child.kill("SIGTERM");
              }, request.timeoutMs);
        const cancel = () => {
          failure = "canceled";
          child.kill("SIGTERM");
        };
        request.signal?.addEventListener("abort", cancel, { once: true });
        child.once("error", () => {
          failure = "spawn";
        });
        child.once("close", (exitCode) => {
          if (timer) clearTimeout(timer);
          request.signal?.removeEventListener("abort", cancel);
          if (!failure && exitCode !== 0) failure = "exit";
          resolve({
            command: request.command,
            args: [...(request.args ?? [])],
            exitCode,
            stdout,
            stderr,
            ...(failure ? { failure } : {}),
          });
        });
      },
    );
  }
}
export { runProcess } from "./process";
export { executionEnv, redactSecrets } from "./utils";
export {
  PermissionBreach,
  changedPaths,
  enforce,
  snapshot,
} from "./permissions";
