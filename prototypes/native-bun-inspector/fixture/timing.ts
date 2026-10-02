/* oxlint-disable func-style -- A named Procedure is the bounded inspector subject. */
export function deadlineProbe() {
  const start = performance.now();
  let total = 0;
  for (let index = 0; index < 10_000; index += 1) {
    total += index;
  }
  const elapsedMs = performance.now() - start;
  return { elapsedMs, outcome: elapsedMs < 10 ? "within-deadline" : "missed-deadline", total };
}
console.log(JSON.stringify(deadlineProbe()));
