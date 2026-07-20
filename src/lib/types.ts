/**
 * Shared types between the visualizer and the server's Mermaid
 * WebSocket protocol. Mirror the shapes in
 * `server/src/routes/mermaid-ws.ts` so a breaking change on the
 * server trips a TypeScript error here.
 */

export type CfgNodeKind =
	| "entry"
	| "exit"
	| "statement"
	| "branch"
	| "merge"
	| "switch"
	| "case"
	| "default"
	| "return"
	| "throw"
	| "break"
	| "continue"
	| "try"
	| "catch"
	| "finally";

export type SnapshotMessage = {
	readonly type: "snapshot";
	readonly entry: string;
	readonly mermaid: string;
	readonly files: ReadonlyArray<string>;
};

export type ErrorMessage = {
	readonly type: "error";
	readonly message: string;
	readonly entry?: string;
};

export type PongMessage = { readonly type: "pong" };

export type ServerMessage = SnapshotMessage | ErrorMessage | PongMessage;
