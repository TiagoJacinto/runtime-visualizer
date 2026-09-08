export class WorkspaceEventsConnectionError extends Error {
  constructor(message = "Backend events unavailable") {
    super(message);
    this.name = "WorkspaceEventsConnectionError";
  }
}
