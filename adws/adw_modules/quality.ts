import { mkdirSync, writeFileSync } from "node:fs";
import { commandString, nowIso, redactSecrets } from "./utils";
import { QualityResult, QualityCheckResult, VerifyOutput } from "./data_types";
import { runProcess } from "./process";

const placeholder = (name: string) => [
  "echo",
  `PLACEHOLDER ${name}: edit adws/adw_modules/quality.ts and replace this echo with the real ${name} command`,
];

async function runOne(s: any, run: any): Promise<QualityCheckResult> {
  const phase = run.phases.at(-1);
  const dir = `${run.contextHandoffDir}/quality/${String(phase.seq).padStart(2, "0")}_${s.name}`;
  mkdirSync(dir, { recursive: true });
  const result = await runProcess(s.argv[0], s.argv.slice(1), {
    cwd: run.repoRoot,
    allowedEnv: run.cfg.defaults.allowed_env,
    timeoutMs: (s.timeoutSeconds || 120) * 1000,
    maxOutputBytes: run.cfg.defaults.max_output_bytes,
    signal: run.signal,
  });
  const output = redactSecrets(result.stdout);
  const error = redactSecrets(result.stderr);
  const stdoutPath = `${dir}/stdout.log`;
  const stderrPath = `${dir}/stderr.log`;
  const commandPath = `${dir}/command.log`;
  writeFileSync(stdoutPath, output);
  writeFileSync(stderrPath, error);
  writeFileSync(
    commandPath,
    `$ ${commandString(s.argv)}\nexit: ${result.exitCode}\nfailure: ${result.failure || "none"}\nduration_seconds: ${(result.durationMs / 1000).toFixed(3)}\ntruncated: ${result.truncated}\nstdout_artifact: ${stdoutPath}\nstderr_artifact: ${stderrPath}\n`,
  );
  const passed = result.exitCode === 0 && !result.failure;
  run.tracer.event({
    adw_id: run.adwId,
    phase_id: phase.phaseId,
    type: "tool_call",
    name: `quality:${s.name}`,
    payload: {
      area: s.area,
      operation: s.operation,
      command: commandString(s.argv),
      returncode: result.exitCode,
      passed,
      failure: result.failure,
      truncated: result.truncated,
      output_artifact: commandPath,
      stdout_artifact: stdoutPath,
      stderr_artifact: stderrPath,
    },
    started_at: nowIso(),
    ended_at: nowIso(),
  });
  run.console.note(
    `quality ${s.name}: ${passed ? "passed" : "failed"} (exit ${result.exitCode}, ${(result.durationMs / 1000).toFixed(1)}s)`,
  );
  return {
    name: s.name,
    area: s.area,
    operation: s.operation,
    command: commandString(s.argv),
    returncode: result.exitCode ?? 127,
    passed,
    duration_seconds: result.durationMs / 1000,
    output_artifact: commandPath,
    stdout_artifact: stdoutPath,
    stderr_artifact: stderrPath,
    output_tail: `${output}\n${error}`.slice(-4000),
    ...(result.failure ? { failure: result.failure } : {}),
    truncated: result.truncated,
  };
}

const spec = (name: string, operation: string, timeoutSeconds = 120) => ({
  name,
  area: "backend",
  operation,
  argv: placeholder(name),
  timeoutSeconds,
});
export const test = (run: any) => runOne(spec("test", "build", 600), run);
export const lint = (run: any) => runOne(spec("lint", "lint"), run);
export const typecheck = (run: any) => runOne(spec("typecheck", "typecheck"), run);
export const build = (run: any) => runOne(spec("build", "build"), run);

function result(checks: QualityCheckResult[]): QualityResult {
  const failures = checks
    .filter((x) => !x.passed)
    .map((x) =>
      `${x.name}: \`${x.command}\` exited ${x.returncode}${x.failure ? ` (${x.failure})` : ""}\n${x.output_tail || ""}`.trim(),
    );
  return {
    passed: !failures.length,
    checks,
    failures,
    artifacts: checks.flatMap(
      (x) => [x.output_artifact, x.stdout_artifact, x.stderr_artifact].filter(Boolean) as string[],
    ),
  };
}
export async function runCommand(
  run: any,
  name: string,
  argv: string[],
  area = "backend",
  operation = "build",
  timeoutSeconds = 600,
) {
  return result([await runOne({ name, area, operation, argv, timeoutSeconds }, run)]);
}
export async function runTests(run: any) {
  return result([await test(run)]);
}
export async function runQuality(run: any) {
  return result([await test(run), await lint(run), await typecheck(run), await build(run)]);
}
export function asEnvelope(q: QualityResult, what = "quality"): VerifyOutput {
  return {
    status: q.passed ? "success" : "fail",
    summary: q.passed
      ? `${what}: all ${q.checks.length} check(s) passed`
      : `${what}: ${q.failures.length} of ${q.checks.length} check(s) failed`,
    artifacts: q.artifacts,
    notes_for_next_agent: q.passed
      ? ""
      : "Fix every failure below. The output is verbatim from the command — trust it over any summary.",
    passed: q.passed,
    failures: q.failures,
  };
}
