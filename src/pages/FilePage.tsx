import { useLocation } from "react-router-dom";
import { FileSelector } from "../components/FileSelector.tsx";
import { MermaidView } from "../components/MermaidView.tsx";
import { useMermaidSnapshot } from "../hooks/useMermaidSnapshot.ts";

export function FilePage() {
	const location = useLocation();
	const file = location.pathname.replace(/^\//, "");
	const { snapshot, error: wsError, connected } = useMermaidSnapshot(file);

	return (
		<div className="file-page">
			<header className="file-page-header">
				<h1>Runtime Visualizer</h1>
				<FileSelector current={file} />
				<span className={`connection-pill ${connected ? "on" : "off"}`}>
					{connected ? "live" : "offline"}
				</span>
			</header>
			{wsError !== null && (
				<div className="error-banner">Flowchart error: {wsError}</div>
			)}
			<section className="flowchart-section">
				{snapshot === null ? (
					<p className="muted">Loading flowchart…</p>
				) : (
					<MermaidView source={snapshot.mermaid} />
				)}
			</section>
		</div>
	);
}
