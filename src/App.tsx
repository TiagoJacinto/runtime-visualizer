import { useState } from "react";
import "./index.css";

type Node = { id: string; label: string; kind: string; location?: { start: { line: number }; end: { line: number } } };
type Graph = { procedures?: Array<{ nodes: Node[]; edges: Array<{ from: string; to: string }> }> };

export default function App() {
	const [source, setSource] = useState("");
	const [graph, setGraph] = useState<Graph | null>(null);
	const [error, setError] = useState<string | null>(null);
	async function visualize() {
		setError(null);
		try {
			const response = await fetch("/api/cfg", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, filePath: "selected.ts" }) });
			const body = await response.json() as { cfg?: Graph; error?: string };
			if (!response.ok || body.cfg === undefined) throw new Error(body.error ?? `HTTP ${response.status}`);
			setGraph(body.cfg);
		} catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
	}
	const procedure = graph?.procedures?.[0];
	return <main>
		<h1>Runtime Visualizer</h1>
		<label htmlFor="procedure-source">TypeScript Procedure</label>
		<textarea id="procedure-source" aria-label="Procedure source" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Enter TypeScript source" />
		<button type="button" onClick={() => void visualize()} disabled={source.length === 0}>Visualize control flow</button>
		{error !== null && <p role="alert">{error}</p>}
		{procedure !== undefined && <section aria-label="Control-flow graph" data-testid="control-flow-graph">
			<h2>Control-flow graph</h2>
			<ul>{procedure.nodes.map((node) => <li key={node.id} data-kind={node.kind}><strong>{node.label}</strong>{node.location !== undefined && <span> (lines {node.location.start.line}-{node.location.end.line})</span>}</li>)}</ul>
			<ul aria-label="Control-flow transitions">{procedure.edges.map((edge) => <li key={`${edge.from}-${edge.to}`}>{edge.from} → {edge.to}</li>)}</ul>
		</section>}
	</main>;
}
