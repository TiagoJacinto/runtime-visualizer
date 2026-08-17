export type RetryScheduler = {
  schedule(delayMs: number, task: () => void): () => void;
};

export function createRetryScheduler(): RetryScheduler {
  return {
    schedule(delayMs, task) {
      const handle = window.setTimeout(task, delayMs);
      return () => window.clearTimeout(handle);
    },
  };
}
