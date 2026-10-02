/* oxlint-disable func-style, no-unused-expressions -- Named Procedures and bare short-circuit expressions are the inspector/CFG subjects, not production style. */
export function visit(flag: boolean) {
  const seen: (number | string)[] = [];
  for (let index = 0; index < 2; index += 1) {
    seen.push(index);
  }
  flag && seen.push("and"); flag || seen.push("or");
  const maybe = flag ? { value: "present" } : undefined;
  maybe?.value;
  return seen;
}

export function sourceProbe(value: number) {
  return value * value;
}

export function stackProbe() {
  return new Error("safe inspector fixture").stack;
}
