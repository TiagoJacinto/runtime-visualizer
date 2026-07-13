// target/functions.ts
// A single TypeScript module packed with functions exercising many language features.
// The byte-for-byte recovery of THIS exact file from the emitted .js.map is the goal
// of the target-source-map-roundtrip feature.

/* ─────────────────────────────  Constants & types  ───────────────────────────── */

export const PI_APPROX = 3.14159265358979;
export const EULER_NUMBER = 2.718281828459045;
export const SAMPLE_UNICODE = "Lógica · naïve · Ω ≈ 42 — “quoted”";
export const MULTILINE_RAW = `
	Tab-indented
	  and CR-less,
	  preserving	tabs
`;

/** A point in 2-D space. */
export interface Point {
	x: number;
	y: number;
}

/** A labelled measurement with optional uncertainty. */
export interface Measurement {
	readonly label: string;
	value: number;
	uncertainty?: number;
	tags: readonly string[];
}

/** A discriminated result type used by several functions below. */
export type Result<T> =
	| { ok: true; value: T }
	| { ok: false; error: string };

/** Generic binary operator. */
export type BinaryOp<T> = (lhs: T, rhs: T) => T;

/* ─────────────────────────────  Pure arithmetic  ───────────────────────────── */

export const add: BinaryOp<number> = (a, b) => a + b;
export const subtract: BinaryOp<number> = (a, b) => a - b;
export const multiply: BinaryOp<number> = (a, b) => a * b;
export const divide: BinaryOp<number> = (a, b) => a / b;

export function sum(...values: number[]): number {
	let total = 0;
	for (const v of values) total += v;
	return total;
}

export function product(...values: number[]): number {
	let total = 1;
	for (const v of values) total *= v;
	return total;
}

export function clamp(value: number, min: number, max: number): number {
	if (value < min) return min;
	if (value > max) return max;
	return value;
}

/* ─────────────────────────────  String helpers  ───────────────────────────── */

export function shout(input: string): string {
	return input.toUpperCase();
}

export function whisper(input: string): string {
	return input.toLowerCase();
}

export function repeat(input: string, n: number): string {
	return n <= 0 ? "" : input.repeat(n);
}

export function slugify(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function truncate(input: string, max: number, suffix = "…"): string {
	if (input.length <= max) return input;
	if (max <= suffix.length) return suffix.slice(0, max);
	return input.slice(0, max - suffix.length) + suffix;
}

export function safeJsonParse<T>(raw: string): Result<T> {
	try {
		return { ok: true, value: JSON.parse(raw) as T };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

/* ─────────────────────────────  Array helpers  ───────────────────────────── */

export function range(n: number): number[] {
	const out: number[] = [];
	for (let i = 0; i < n; i++) out.push(i);
	return out;
}

export function unique<T>(values: readonly T[]): T[] {
	return Array.from(new Set(values));
}

export function groupBy<T, K extends string | number>(
	items: readonly T[],
	key: (item: T) => K,
): Record<K, T[]> {
	const out = {} as Record<K, T[]>;
	for (const item of items) {
		const k = key(item);
		(out[k] ??= []).push(item);
	}
	return out;
}

export function chunk<T>(values: readonly T[], size: number): T[][] {
	if (size <= 0) throw new RangeError("chunk size must be > 0");
	const out: T[][] = [];
	for (let i = 0; i < values.length; i += size) {
		out.push(values.slice(i, i + size));
	}
	return out;
}

export function zip<A, B>(as: readonly A[], bs: readonly B[]): Array<[A, B]> {
	const length = Math.min(as.length, bs.length);
	const out: Array<[A, B]> = [];
	for (let i = 0; i < length; i++) out.push([as[i]!, bs[i]!]);
	return out;
}

/* ─────────────────────────────  Geometry  ───────────────────────────── */

export const origin: Point = Object.freeze({ x: 0, y: 0 });

export function distance(a: Point, b: Point): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.sqrt(dx * dx + dy * dy);
}

export function midpoint(a: Point, b: Point): Point {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function circleArea(radius: number): number {
	return PI_APPROX * radius * radius;
}

/* ─────────────────────────────  Async utilities  ───────────────────────────── */

export async function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
	fn: () => Promise<T>,
	attempts: number,
	backoffMs = 50,
): Promise<T> {
	let lastErr: unknown;
	for (let i = 0; i < attempts; i++) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			if (i < attempts - 1) await delay(backoffMs * (i + 1));
		}
	}
	throw lastErr;
}

export async function* asyncMap<T, U>(
	source: AsyncIterable<T>,
	fn: (item: T) => Promise<U>,
): AsyncIterable<U> {
	for await (const item of source) yield await fn(item);
}

/* ─────────────────────────────  Generators  ───────────────────────────── */

export function* fibonacci(limit = Infinity): Generator<number> {
	let [a, b] = [0, 1];
	while (a < limit) {
		yield a;
		[a, b] = [b, a + b];
	}
}

export function* take<T>(source: Iterable<T>, n: number): Generator<T> {
	if (n < 0) throw new RangeError("n must be >= 0");
	let i = 0;
	for (const item of source) {
		if (i >= n) return;
		yield item;
		i++;
	}
}

/* ─────────────────────────────  Higher-order / curry  ───────────────────────────── */

export function pipe<A, B, C>(
	f: (a: A) => B,
	g: (b: B) => C,
): (a: A) => C {
	return (a) => g(f(a));
}

export function memoize<Args extends readonly unknown[], R>(
	fn: (...args: Args) => R,
): (...args: Args) => R {
	const cache = new Map<string, R>();
	return (...args: Args): R => {
		const key = JSON.stringify(args);
		const hit = cache.get(key);
		if (hit !== undefined) return hit;
		const result = fn(...args);
		cache.set(key, result);
		return result;
	};
}

/* ─────────────────────────────  Type narrowing  ───────────────────────────── */

export function describe(value: unknown): string {
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	if (typeof value === "boolean") return `bool(${value})`;
	if (typeof value === "number") return `number(${value})`;
	if (typeof value === "bigint") return `bigint(${value})`;
	if (typeof value === "string") return `string(${value.length})`;
	if (typeof value === "function") return `function(${value.name || "anonymous"})`;
	if (Array.isArray(value)) return `array(${value.length})`;
	if (value instanceof Date) return `date(${value.toISOString()})`;
	if (value instanceof Map) return `map(${value.size})`;
	if (value instanceof Set) return `set(${value.size})`;
	return `object(${typeof value})`;
}

/* ─────────────────────────────  Self-test  ───────────────────────────── */

export function selfCheck(): boolean {
	const checks: Array<[boolean, string]> = [
		[sum(1, 2, 3, 4) === 10, "sum"],
		[product(2, 3, 4) === 24, "product"],
		[clamp(5, 0, 10) === 5 && clamp(-1, 0, 10) === 0 && clamp(11, 0, 10) === 10, "clamp"],
		[slugify("  Hello, World!  ") === "hello-world", "slugify"],
		[truncate("abcdef", 4) === "abc…", "truncate"],
		[unique([1, 1, 2, 3, 3]) .length === 3, "unique"],
		[chunk([1, 2, 3, 4, 5], 2).length === 3, "chunk"],
		[Math.abs(distance({ x: 0, y: 0 }, { x: 3, y: 4 }) - 5) < 1e-9, "distance"],
		[Array.from(take(fibonacci(1000), 7)).join(",") === "0,1,1,2,3,5,8", "fibonacci.take"],
		[describe(null) === "null" && describe([1, 2]) === "array(2)", "describe"],
		[safeJsonParse<{ a: number }>("{\"a\":1}").ok === true, "safeJsonParse"],
	];
	for (const [ok] of checks) if (!ok) return false;
	return true;
}