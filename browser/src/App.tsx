import { useState } from "react";
import "./index.css";

type GraphNode = {
	id: string;
	label: string;
	kind: string;
	location?: { start: { line: number }; end: { line: number } };
};
type GraphEdge = { from: string; to: string; label?: string; kind?: string };
type Graph = {
	procedures?: Array<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
};

type CfgResponse = { cfg?: Graph; error?: string };

export default function App() {
	const [fileName, setFileName] = useState("selected.ts");
	const [source, setSource] = useState("");
	const [graph, setGraph] = useState<Graph | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [showImports, setShowImports] = useState(false);

	async function selectFile(file: File | undefined) {
		if (file === undefined) return;
		setFileName(file.name);
		setSource(await file.text());
		setGraph(null);
		setError(null);
	}

	async function visualize() {
		setError(null);
		setIsLoading(true);
		try {
			const response = await fetch("/api/cfg", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ source, filePath: fileName, showImports }),
			});
			const responseText = await response.text();
			let body: CfgResponse = {};
			if (responseText.trim() !== "") {
				try {
					body = JSON.parse(responseText) as CfgResponse;
				} catch {
					throw new Error(
						`CFG service returned invalid JSON (HTTP ${response.status}).`,
					);
				}
			}
			if (!response.ok || body.cfg === undefined) {
				throw new Error(
					body.error ??
						(responseText.trim() === ""
							? `CFG service returned an empty response (HTTP ${response.status}). Is the backend running?`
							: `HTTP ${response.status}`),
				);
			}
		setGraph(body.cfg);
	} catch (cause) {
		setError(cause instanceof Error ? cause.message : String(cause));
	} finally {
		setIsLoading(false);
	}
	}

	const procedure = graph?.procedures?.[0];
	const nodeLabels = new Map(procedure?.nodes.map((node) => [node.id, node.label]));

	return (
		<main>
			<h1>Runtime Visualizer</h1>
			<p>Select a TypeScript file Procedure to inspect its control-flow graph.</p>
			<label htmlFor="procedure-file">TypeScript file</label>
			<input
				id="procedure-file"
				type="file"
				accept=".ts,.tsx,text/typescript"
				onChange={(event) => void selectFile(event.target.files?.[0])}
			/>
			<label htmlFor="procedure-source">Procedure source</label>
			<textarea
				id="procedure-source"
				aria-label="Procedure source"
				value={source}
				onChange={(event) => setSource(event.target.value)}
				placeholder="Enter TypeScript source"
			/>
			<label>
				<input
					type="checkbox"
					checked={showImports}
					onChange={(event) => setShowImports(event.target.checked)}
				/>
				Show imports
			</label>
			<button type="button" onClick={() => void visualize()} disabled={isLoading}>
				{isLoading ? "Building graph…" : "Visualize control flow"}
			</button>
			{error !== null && <p role="alert">{error}</p>}
			{procedure !== undefined && (
				<section aria-label="Control-flow graph" data-testid="control-flow-graph">
					<h2>Control-flow graph for {fileName}</h2>
					<ul aria-label="Graph nodes">
						{procedure.nodes.map((node) => (
							<li key={node.id} data-kind={node.kind}>
								<strong>{node.label}</strong>
								{node.location !== undefined && (
									<span>
										{" "}(lines {node.location.start.line}-{node.location.end.line})
									</span>
								)}
							</li>
						))}
					</ul>
					<ul aria-label="Control-flow transitions">
						{procedure.edges.map((edge, index) => (
							<li key={`${edge.from}-${edge.to}-${index}`}>
								{nodeLabels.get(edge.from) ?? edge.from}
								{edge.label === undefined ? "" : ` (${edge.label})`}
								{" → "}
								{nodeLabels.get(edge.to) ?? edge.to}
							</li>
						))}
					</ul>
				</section>
			)}
		</main>
	);
}
