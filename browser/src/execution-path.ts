export type ExecutionNode = {
	readonly id: string;
	readonly kind: string;
	readonly label?: string;
};

export type ExecutionEdge = {
	readonly from: string;
	readonly to: string;
	readonly label?: string;
};

export type ExecutionProcedure = {
	readonly entry: string;
	readonly exit: string;
	readonly nodes: ReadonlyArray<ExecutionNode>;
	readonly edges: ReadonlyArray<ExecutionEdge>;
};

/**
 * Selects one finite representative path through a static graph.
 * Decisions take their true/first alternative on the first visit and
 * their exit/next alternative when revisited, keeping loop graphs finite.
 */
export function buildExecutionPath(procedure: ExecutionProcedure): string[] {
	const nodeById = new Map(procedure.nodes.map((node) => [node.id, node]));
	const edgesBySource = new Map<string, ExecutionEdge[]>();
	for (const edge of procedure.edges) {
		const outgoing = edgesBySource.get(edge.from) ?? [];
		outgoing.push(edge);
		edgesBySource.set(edge.from, outgoing);
	}

	const path: string[] = [];
	const visits = new Map<string, number>();
	let current = procedure.entry;
	const maximumSteps = Math.max(procedure.nodes.length * 3, 1);

	for (let step = 0; step < maximumSteps && current !== procedure.exit; step += 1) {
		const node = nodeById.get(current);
		const outgoing = edgesBySource.get(current) ?? [];
		if (node === undefined || outgoing.length === 0) break;

		const visitCount = visits.get(current) ?? 0;
		visits.set(current, visitCount + 1);
		const edge = chooseEdge(node.kind, outgoing, visitCount);
		if (edge === undefined || edge.to === procedure.entry) break;

		current = edge.to;
		path.push(current);
	}

	return path;
}

function chooseEdge(
	nodeKind: string,
	outgoing: ReadonlyArray<ExecutionEdge>,
	visitCount: number,
): ExecutionEdge | undefined {
	if (nodeKind === "branch") {
		if (visitCount === 0) {
			return outgoing.find((edge) => edge.label === "true") ?? outgoing[0];
		}
		return outgoing.find((edge) => edge.label === "false") ?? outgoing[0];
	}
	return outgoing[0];
}
