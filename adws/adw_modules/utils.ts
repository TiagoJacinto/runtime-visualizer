import { existsSync, readFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
export function operatorEnv(allowed: string[] = []): Record<string, string> {
  const env = executionEnv(["ENGINEER_NAME", "PI_MODELS_PATH", "PI_PATH", ...allowed]);
  const v = process.env.VIRTUAL_ENV;
  if (v)
    env.PATH = (env.PATH || "")
      .split(":")
      .filter((p) => p !== `${v}/bin`)
      .join(":");
  return env;
}
export function newId(length = 8) {
  return crypto.randomUUID().replaceAll("-", "").slice(0, length);
}
export function nowIso() {
  return new Date().toISOString();
}
export function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
  return path;
}
export function resolvePrompt(arg: string) {
  try {
    if (existsSync(arg)) return readFileSync(arg, "utf8");
  } catch {}
  return arg;
}
export function engineerName() {
  if (process.env.ENGINEER_NAME?.trim()) return process.env.ENGINEER_NAME.trim();
  const r = spawnSync("git", ["config", "user.name"], {
    encoding: "utf8",
    timeout: 5000,
  });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : process.env.USER || "engineer";
}
export function shellQuote(s: string) {
  return `'${s.replaceAll("'", "'\\''")}'`;
}
export function commandString(argv: string[]) {
  return argv.map(shellQuote).join(" ");
}
const SAFE_ENV_KEYS = [
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LOGNAME",
  "PATH",
  "PWD",
  "SHELL",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "USER",
];
export function executionEnv(allowed: string[] = []): Record<string, string> {
  const names = new Set([...SAFE_ENV_KEYS, ...allowed]);
  const env: Record<string, string> = {};
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}
export function redactSecrets(value: string) {
  let output = value;
  for (const key of Object.keys(process.env)) {
    const secret = process.env[key];
    if (/(key|token|password|secret|credential|auth)/i.test(key) && secret && secret.length >= 8)
      output = output.split(secret).join("[REDACTED]");
  }
  return output.replace(/(api[_-]?key|token|password|secret)([=:][^\s,;]+)/gi, "$1=[REDACTED]");
}
export function atomicWrite(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${crypto.randomUUID()}`;
  writeFileSync(temp, content);
  renameSync(temp, path);
  return path;
}
