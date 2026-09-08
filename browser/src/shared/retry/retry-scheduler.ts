export class RetryScheduler {
  // SAFETY: this is an injectable adapter; the instance carries no state.
  // oxlint-disable-next-line eslint/class-methods-use-this
  schedule(delayMs: number, task: () => void): () => void {
    const handle = window.setTimeout(task, delayMs);
    return () => window.clearTimeout(handle);
  }
}
