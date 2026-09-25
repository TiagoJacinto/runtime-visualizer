export class ProjectPermissionError extends Error {
  constructor(message = "Permission to read this project is unavailable.") {
    super(message);
    this.name = "ProjectPermissionError";
  }
}
