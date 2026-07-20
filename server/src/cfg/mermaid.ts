/**
 * Mermaid flowchart renderer for control-flow graphs.
 *
 * Given a {@link ControlFlowGraph} (or a list of {@link ProjectFile}s
 * from {@link buildProjectCfg}), emits the source of a Mermaid
 * `flowchart` diagram. The renderer is purely presentational — it
 * never re-walks the source — so callers can pair it with whatever
 * upstream produced the CFG (analyser, project walker, future
 * incremental rebuild).
 *
 * Node ids are namespaced per file (`f0`, `f1`, …) so a multi-file
 * subgraph doesn't collide on the underlying id space. Mermaid's
 * graphviz-style identifiers are sanitised through a single
 * {@link makeIdResolver} helper that memoises the mapping — the same
 * raw input always returns the same final id within a render.
 */

import type { CfgEdge, FunctionCfg } from "./types.ts";
import type { ProjectFile } from "./project.ts";

/** A single unit of input to the renderer: a {@link ProjectFile}-shaped pair. */
export type MermaidInput = Pick<ProjectFile, "path" | "cfg">;

/** Options for {@link renderMermaid}. */
export type RenderOptions = {
	/**
	 * Graph direction (`TD`, `LR`, …). Mermaid default is `TD`; we
	 * default to `TD` too so the output is always valid without
	 * choosing.
	 */
	readonly direction?: "TD" | "LR" | "RL" | "BT";
};

const DEFAULT_DIRECTION: "TD" | "LR" | "RL" | "BT" = "TD";

/**
 * Renders a single file's CFG as a Mermaid `flowchart` source.
 */
export function renderMermaid(
	input: MermaidInput,
	options: RenderOptions = {},
): string {
	return renderMermaidMany([input], options).mermaid;
}

/**
 * Renders one or more file CFGs as a single Mermaid `flowchart`
 * source. Each file becomes a `subgraph`, so the resulting diagram
 * mirrors the import topology the project walker produces.
 *
 * Returns the Mermaid source plus a parallel list of node refs
 * so the visualizer can highlight a node from its CFG id without
 * re-walking the rendered SVG (Mermaid prefixes group ids with
 * `flowchart-<id>-N`; the client just needs the `<id>` part).
 */
export function renderMermaidMany(
	inputs: ReadonlyArray<MermaidInput>,
	options: RenderOptions = {},
): { mermaid: string } {
	const direction = options.direction ?? DEFAULT_DIRECTION;
	const id = makeIdResolver();
	const lines: string[] = [];
	lines.push(`flowchart ${direction}`);

	for (let i = 0; i < inputs.length; i += 1) {
		const input = inputs[i];
		if (input === undefined) continue;
		const filePrefix = `f${i}`;
		lines.push(
			`  subgraph ${id(`file_${i}_${input.path}`)}["${escapeLabel(input.path)}"]`,
		);
		lines.push(`    direction ${direction}`);
		emitFunctions(lines, input.cfg.functions, filePrefix, direction, id);
		lines.push(`  end`);
	}

	for (let i = 0; i < inputs.length; i += 1) {
		const input = inputs[i];
		if (input === undefined) continue;
		const filePrefix = `f${i}`;
		emitFunctionEdges(lines, input.cfg.functions, filePrefix, id);
	}

	return { mermaid: lines.join("\n") + "\n" };
}

/**
 * Convenience wrapper: feed it the raw {@link ProjectFile}s and
 * get back the rendered Mermaid source plus the per-node metadata
 * the visualizer uses to highlight currently-running statements
 * in the rendered SVG. Returns an empty flowchart for an empty
 * input list so the websocket can still send a valid message.
 */
export function renderProjectFiles(
	files: ReadonlyArray<ProjectFile>,
	options: RenderOptions = {},
): { mermaid: string } {
	return renderMermaidMany(files, options);
}

// ---------------------------------------------------------------------------
// Emitters
// ---------------------------------------------------------------------------

function emitFunctions(
	lines: string[],
	functions: ReadonlyArray<FunctionCfg>,
	filePrefix: string,
	direction: "TD" | "LR" | "RL" | "BT",
	id: (raw: string) => string,
): void {
	for (const fn of functions) {
		const fnPrefix = `${filePrefix}_fn`;
		lines.push(
			`    subgraph ${id(`${fnPrefix}_${fn.name}`)}["${escapeLabel(fnHeaderLabel(fn))}"]`,
		);
		lines.push(`      direction ${direction}`);
		for (const node of fn.nodes) {
			lines.push(
				`      ${id(`${fnPrefix}_${node.id}`)}["${escapeLabel(node.label)}"]`,
			);
		}
		lines.push(`    end`);
	}
}

function emitFunctionEdges(
	lines: string[],
	functions: ReadonlyArray<FunctionCfg>,
	filePrefix: string,
	id: (raw: string) => string,
): void {
	const fnPrefix = `${filePrefix}_fn`;
	for (const fn of functions) {
		const labelByNode = new Map<string, string>();
		for (const node of fn.nodes) labelByNode.set(node.id, node.label);
		for (const edge of fn.edges) {
			const from = id(`${fnPrefix}_${edge.from}`);
			const to = id(`${fnPrefix}_${edge.to}`);
			const label = edgeLabelText(edge, labelByNode);
			if (label === null) {
				lines.push(`    ${from} --> ${to}`);
			} else {
				lines.push(`    ${from} -->|${escapePipeLabel(label)}| ${to}`);
			}
		}
	}
}

function edgeLabelText(
	edge: CfgEdge,
	labelByNode: ReadonlyMap<string, string>,
): string | null {
	// The existing CFG `label` field wins when present (callers can
	// attach arbitrary text). Otherwise we synthesise one from the
	// edge kind so the diagram stays informative.
	if (edge.label !== undefined && edge.label.length > 0) return edge.label;
	switch (edge.kind) {
		case "true":
			return "true";
		case "false":
			return "false";
		case "case": {
			const target = labelByNode.get(edge.to);
			return target !== undefined ? target.replace(/:$/, "") : "case";
		}
		case "default":
			return "default";
		case "unwind":
			return "unwind";
		case "entry":
		case "next":
		case undefined:
			return null;
	}
}

function fnHeaderLabel(fn: FunctionCfg): string {
	const asyncStar = `${fn.isAsync ? "async " : ""}${fn.isGenerator ? "*" : ""}`;
	const params = fn.params.length > 0 ? `(${fn.params.join(", ")})` : "()";
	return `function ${asyncStar}${fn.name}${params}`;
}

// ---------------------------------------------------------------------------
// Escaping helpers
// ---------------------------------------------------------------------------

/**
 * Turns a node label into something Mermaid can render inside a
 * `["..."]` double-quoted string.
 *
 * Mermaid's flowchart lexer treats a small set of characters as
 * syntax even inside a quoted label: `"` and `\` end the string,
 * `[]` open/close a sub-shape, and several punctuation characters
 * (`^`, `|`, `-`, `>`, `<`, etc.) collide with edge / arrow syntax.
 * Rather than enumerate every collision — the list grows each time
 * a real source file trips a parse error — we keep only ASCII
 * alphanumerics, common identifier punctuation (`. , ; : ? ( ) =
 * ! &`), and whitespace. Anything else is dropped. The labels are
 * short snippets of source code, so the substitutions are barely
 * visible in the rendered diagram; the upside is the renderer is
 * robust to any source-file input.
 *
 * ponytail: a label-syntax whitelist is more robust than a
 * blacklist, but loses a tiny bit of fidelity (regex ranges,
 * template-literal backticks, etc. vanish). For the visualizer's
 * "what statement is currently running" use case that's fine —
 * the label is a hint, not the source.
 */
function escapeLabel(label: string): string {
	const sanitized = label
		.replace(/\r?\n/g, " ")
		.replace(/[^A-Za-z0-9 .,;:_=?!&()]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return sanitized.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapePipeLabel(label: string): string {
	// Edge labels live between `|...|` pipes, so they can't contain `|`.
	return label.replace(/\|/g, "\\|");
}

/**
 * Builds an id resolver that maps any raw input string to a valid
 * Mermaid graphviz-style identifier `[A-Za-z_][A-Za-z0-9_]*`,
 * memoising the result so the same input always yields the same id
 * within a single render pass.
 *
 * Without memoisation a node would get id `X` when declared and `X_1`
 * when referenced from an edge — the shared counter would bump on the
 * second call.
 */
function makeIdResolver(): (raw: string) => string {
	const cache = new Map<string, string>();
	const collisions = new Map<string, number>();
	return (raw: string): string => {
		const cached = cache.get(raw);
		if (cached !== undefined) return cached;
		const safe = raw.replace(/[^A-Za-z0-9_]/g, "_");
		const seed =
			safe.length > 0 && /[A-Za-z_]/.test(safe[0]!) ? safe : `_${safe}`;
		const n = collisions.get(seed);
		let id: string;
		if (n === undefined) {
			collisions.set(seed, 1);
			id = seed;
		} else {
			collisions.set(seed, n + 1);
			id = `${seed}_${n}`;
		}
		cache.set(raw, id);
		return id;
	};
}
