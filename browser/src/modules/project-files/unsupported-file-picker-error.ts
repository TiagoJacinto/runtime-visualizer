export class UnsupportedFilePickerError extends Error {
  constructor() {
    super("Directory picker is not supported in this browser.");
    this.name = "UnsupportedFilePickerError";
  }
}
