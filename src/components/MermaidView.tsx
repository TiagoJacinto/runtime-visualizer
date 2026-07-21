import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import DOMPurify from "dompurify";

let mermaidInited = false;
let counter = 0;

async function ensureMermaid(): Promise<void> {
	if (mermaidInited) return;
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: "loose",
		theme: window.matchMedia("(prefers-color-scheme: dark)").matches
			? "dark"
			: "default",
	});
	mermaidInited = true;
}

export function MermaidView({ source }: { readonly source: string }) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (source.length === 0) return;
		let cancelled = false;
		const id = `mermaid-graph-${counter++}`;
		void (async () => {
			try {
				await ensureMermaid();
				if (cancelled || containerRef.current === null) return;
				const { svg } = await mermaid.render(id, source);
				if (cancelled || containerRef.current === null) return;
				const fragment = DOMPurify.sanitize(svg, {
					USE_PROFILES: { svg: true, svgFilters: true },
					RETURN_DOM_FRAGMENT: true,
				});
				containerRef.current.replaceChildren(fragment);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [source]);

	return (
		<div className="mermaid-view">
			{error !== null && <div className="mermaid-error">mermaid: {error}</div>}
			<div ref={containerRef} className="mermaid-container" />
		</div>
	);
}
