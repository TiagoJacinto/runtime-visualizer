import { useEffect, useState } from "react";
import "./index.css";

type GraphNode = {
	id: string;
	label: string;
	kind: string;
	location?: { start: { line: number }; end: { line: number } };
};
type GraphEdge = { from: string; to: string; label?: string; kind?: string };
type GraphProcedure = {
	name?: string;
	nodes: GraphNode[];
	edges: GraphEdge[];
	entry?: string;
	exit?: string;
};
type Graph = {
	procedures?: GraphProcedure[];
};

type GraphDiagnostic = {
	procedure: string;
	dependency?: string;
	reason: string;
	message?: string;
};
type CfgResponse = {
	cfg?: Graph;
	error?: string;
	diagnostics?: GraphDiagnostic[];
};
type ExecutionStreamEvent =
	| { event: "node"; data: { nodeId: string } }
	| {
			event: "result";
			data: { status: "Succeeded" | "Failed"; error?: string };
	  };

const EXECUTION_HIGHLIGHT_INTERVAL_MS = 1_000;

export default function App() {
	const [fileName, setFileName] = useState("main.ts");
	const [functionName, setFunctionName] = useState("");
	const [source, setSource] = useState("");
	const [dependencyFileName, setDependencyFileName] = useState("helper.ts");
	const [dependencySource, setDependencySource] = useState("");
	const [graph, setGraph] = useState<Graph | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [diagnostics, setDiagnostics] = useState<GraphDiagnostic[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [showImports, setShowImports] = useState(false);
	const [executionPath, setExecutionPath] = useState<string[]>([]);
	const [executionIndex, setExecutionIndex] = useState<number | null>(null);
	const [executionStatus, setExecutionStatus] = useState<
		"idle" | "running" | "complete" | "failed"
	>("idle");
	const [executionResult, setExecutionResult] = useState<
		"Succeeded" | "Failed" | null
	>(null);
	const [executionFinished, setExecutionFinished] = useState(false);

	async function selectFile(file: File | undefined) {
		if (file === undefined) return;
		setFileName(file.name);
		setFunctionName("");
		setSource(await file.text());
		setGraph(null);
		setError(null);
		setDiagnostics([]);
	}

	useEffect(() => {
		if (executionStatus !== "running" || executionIndex === null) return;
		const timer = window.setTimeout(() => {
			if (executionIndex + 1 >= executionPath.length) {
				if (!executionFinished) return;
				setExecutionIndex(null);
				setExecutionStatus(
					executionResult === "Failed" ? "failed" : "complete",
				);
				return;
			}
			setExecutionIndex(executionIndex + 1);
		}, EXECUTION_HIGHLIGHT_INTERVAL_MS);
		return () => window.clearTimeout(timer);
	}, [
		executionFinished,
		executionIndex,
		executionPath,
		executionResult,
		executionStatus,
	]);

	function resetExecution() {
		setExecutionPath([]);
		setExecutionIndex(null);
		setExecutionStatus("idle");
		setExecutionResult(null);
		setExecutionFinished(false);
	}

	async function runProcedure() {
		if (procedure === undefined) return;
		setError(null);
		setExecutionPath([]);
		setExecutionIndex(null);
		setExecutionResult(null);
		setExecutionFinished(false);
		setExecutionStatus("running");
		try {
			const response = await fetch("/api/execute", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					source,
					filePath: fileName.trim(),
					...(functionName.trim() === ""
						? {}
						: { functionName: functionName.trim() }),
					files: { [dependencyFileName.trim()]: dependencySource },
				}),
			});
			if (!response.ok || response.body === null) {
				throw new Error(`Execution service returned HTTP ${response.status}.`);
			}
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let pending = "";
			let receivedEvents = false;
			let receivedResult = false;
			const handleLine = (line: string): void => {
				if (line.trim() === "") return;
				const event = JSON.parse(line) as ExecutionStreamEvent;
				if (event.event === "node") {
					receivedEvents = true;
					setExecutionPath((current) => [...current, event.data.nodeId]);
					setExecutionIndex((current) => current ?? 0);
					return;
				}
				receivedResult = true;
				setExecutionResult(event.data.status);
				setExecutionFinished(true);
				if (event.data.error !== undefined) setError(event.data.error);
				if (!receivedEvents)
					setExecutionStatus(
						event.data.status === "Failed" ? "failed" : "complete",
					);
			};
			for (;;) {
				const chunk = await reader.read();
				pending += decoder.decode(chunk.value ?? new Uint8Array(), {
					stream: !chunk.done,
				});
				let newline = pending.indexOf("\n");
				while (newline !== -1) {
					handleLine(pending.slice(0, newline));
					pending = pending.slice(newline + 1);
					newline = pending.indexOf("\n");
				}
				if (chunk.done) break;
			}
			if (pending.trim() !== "") handleLine(pending);
			if (!receivedResult)
				throw new Error("Execution service ended without a terminal Result.");
		} catch (cause) {
			setExecutionIndex(null);
			setExecutionStatus("failed");
			setExecutionResult("Failed");
			setExecutionFinished(true);
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}

	async function visualize() {
		const selectedFileName = fileName.trim();
		const selectedFunctionName = functionName.trim();
		const selectedDependencyFileName = dependencyFileName.trim();
		setError(null);
		setDiagnostics([]);
		setGraph(null);
		resetExecution();
		if (selectedFileName === "" || selectedDependencyFileName === "") {
			setError("File names must not be blank.");
			return;
		}
		if (selectedFileName === selectedDependencyFileName) {
			setError("File names must be distinct.");
			return;
		}
		setIsLoading(true);
		try {
			const response = await fetch("/api/cfg", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					source,
					filePath: selectedFileName,
					...(selectedFunctionName === ""
						? {}
						: { functionName: selectedFunctionName }),
					showImports,
					files: { [selectedDependencyFileName]: dependencySource },
				}),
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
				if (body.diagnostics !== undefined) {
					setDiagnostics(body.diagnostics);
					return;
				}
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
	const nodeLabels = new Map(
		procedure?.nodes.map((node) => [node.id, node.label]),
	);
	const activeNodeId =
		executionIndex === null ? null : (executionPath[executionIndex] ?? null);

	return (
		<main>
			<h1>Runtime Visualizer</h1>
			<p>
				Select a TypeScript file Procedure to inspect its control-flow graph.
			</p>
			<section aria-label="TypeScript files" className="file-editors">
				<fieldset>
					<legend>File 1</legend>
					<label htmlFor="file-1-name">File 1 name</label>
					<input
						id="file-1-name"
						type="text"
						value={fileName}
						onChange={(event) => setFileName(event.target.value)}
					/>
					<label htmlFor="function-name">Function name (optional)</label>
					<input
						id="function-name"
						type="text"
						value={functionName}
						onChange={(event) => setFunctionName(event.target.value)}
						placeholder="Leave blank for the file Procedure"
					/>
					<label htmlFor="file-1-source">File 1 source</label>
					<textarea
						id="file-1-source"
						aria-label="File 1 source"
						value={source}
						onChange={(event) => setSource(event.target.value)}
						placeholder="Enter TypeScript source"
					/>
					<label htmlFor="procedure-file">Load File 1 from disk</label>
					<input
						id="procedure-file"
						type="file"
						accept=".ts,.tsx,text/typescript"
						onChange={(event) => void selectFile(event.target.files?.[0])}
					/>
				</fieldset>
				<fieldset>
					<legend>File 2</legend>
					<label htmlFor="file-2-name">File 2 name</label>
					<input
						id="file-2-name"
						type="text"
						value={dependencyFileName}
						onChange={(event) => setDependencyFileName(event.target.value)}
					/>
					<label htmlFor="file-2-source">File 2 source</label>
					<textarea
						id="file-2-source"
						aria-label="File 2 source"
						value={dependencySource}
						onChange={(event) => setDependencySource(event.target.value)}
						placeholder="Enter TypeScript source"
					/>
				</fieldset>
			</section>
			<label>
				<input
					type="checkbox"
					checked={showImports}
					onChange={(event) => setShowImports(event.target.checked)}
				/>
				Show imports
			</label>
			<button
				type="button"
				onClick={() => void visualize()}
				disabled={isLoading}
			>
				{isLoading ? "Building graph…" : "Visualize control flow"}
			</button>
			{procedure !== undefined && (
				<>
					<button
						type="button"
						onClick={runProcedure}
						disabled={executionStatus === "running"}
					>
						{executionStatus === "running"
							? "Running procedure…"
							: "Run procedure"}
					</button>
					<p role="status" aria-live="polite">
						{executionStatus === "running" && activeNodeId !== null
							? `Execution running: ${nodeLabels.get(activeNodeId) ?? activeNodeId}`
							: executionStatus === "complete"
								? "Execution complete"
								: executionStatus === "failed"
									? "Execution failed"
									: "Execution ready"}
					</p>
				</>
			)}
			{error !== null && <p role="alert">{error}</p>}
			{diagnostics.length > 0 && (
				<section aria-label="Graph diagnostics" role="alert">
					<h2>Graph diagnostics</h2>
					<ul>
						{diagnostics.map((diagnostic, index) => (
							<li
								key={`${diagnostic.reason}-${diagnostic.dependency ?? "selected"}-${index}`}
							>
								<strong>{diagnostic.reason}</strong>
								{diagnostic.dependency === undefined
									? ""
									: ` (${diagnostic.dependency})`}
								{diagnostic.message === undefined
									? ""
									: `: ${diagnostic.message}`}
							</li>
						))}
					</ul>
				</section>
			)}
			{procedure !== undefined && (
				<section
					aria-label="Control-flow graph"
					data-testid="control-flow-graph"
				>
					<h2>Control-flow graph for {procedure.name ?? fileName}</h2>
					<ul aria-label="Graph nodes">
						{procedure.nodes.map((node) => (
							<li
								key={node.id}
								data-kind={node.kind}
								data-testid={`graph-node-${node.id}`}
								data-execution-state={
									activeNodeId === node.id ? "active" : undefined
								}
								aria-current={activeNodeId === node.id ? "step" : undefined}
							>
								<strong>{node.label}</strong>
								{node.location !== undefined && (
									<span>
										{" "}
										(lines {node.location.start.line}-{node.location.end.line})
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
