export class RetryScheduler {
  schedule(delayMs: number, task: () => void): () => void {
    const handle = window.setTimeout(task, delayMs);
    return () => window.clearTimeout(handle);
  }
}
