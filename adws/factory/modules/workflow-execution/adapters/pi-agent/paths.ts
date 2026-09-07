import { resolve } from "node:path";
export function resolveRuntimePath(value: string): string {
  return resolve(process.cwd(), value);
}
