// entry.ts
import { mid } from "./mid.ts";
import "./missing.ts";          // missing import → recorded as missing, skipped
import type { Other } from "./also-missing.ts";
// oxlint-disable-next-line no-unused-vars
import { ext } from "some-pkg"; // bare specifier → external
export function run(): number { return mid(); }
export type Entry = Other;