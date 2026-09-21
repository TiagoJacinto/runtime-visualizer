import { readFileSync } from "node:fs";

const model = process.env.TYPESAFE_MODEL ?? "jev-1.13.0";
type JsonObject = Record<string, unknown>;
type Arguments = {
  readonly logs: string;
  readonly run: string;
  readonly changedFiles: string;
  readonly response?: string;
  readonly dryRun: boolean;
};

const usage = (): never => {
  throw new Error(
    "Usage: bun scripts/classify-ci-failure.ts --logs <path> --run <path> --changed-files <path> [--response <path>] [--dry-run]",
  );
};

const parseArguments = (argv: readonly string[]): Arguments => {
  const values = new Map<string, string>();
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === undefined || !argument.startsWith("--")) usage();
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) usage();
    values.set(argument, value);
    index += 1;
  }
  const logs = values.get("--logs");
  const run = values.get("--run");
  const changedFiles = values.get("--changed-files");
  if (logs === undefined || run === undefined || changedFiles === undefined) usage();
  return {
    changedFiles,
    dryRun,
    logs,
    response: values.get("--response"),
    run,
  };
};

const readText = (path: string): string => readFileSync(path, "utf8");
const readObject = (path: string): JsonObject => {
  const parsed: unknown = JSON.parse(readText(path));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path} must contain a JSON object.`);
  }
  return parsed as JsonObject;
};

const buildRequest = (state: JsonObject): JsonObject => ({
  model,
  state,
  questions: {
    cause: {
      type: "choice",
      instructions:
        "Classify the primary cause of this failed validation. Choose insufficient_evidence when the logs do not establish the cause.",
      criteria: {
        product_regression: "The product implementation violates expected behavior.",
        test_regression: "The test or its expectation is wrong or stale.",
        environment_or_dependency_failure:
          "The failure is caused by a runner, service, dependency, or infrastructure problem.",
        flaky_or_nondeterministic_failure:
          "The same validation may pass or fail without a relevant code change.",
        configuration_or_contract_failure:
          "Configuration, command wiring, or an interface contract is incorrect.",
        insufficient_evidence: "The available evidence cannot distinguish the causes.",
      },
    },
    evidence_sufficient: {
      type: "noul",
      instructions: "Is there enough evidence to classify the failure without inventing facts?",
      criteria: {
        true: "The logs and run context support a specific classification.",
        false: "The logs are incomplete, contradictory, or too ambiguous.",
      },
    },
    actionability: {
      type: "score",
      instructions: "How actionable is the available evidence for the next engineering step?",
      criteria: [
        "No useful next step is identified",
        "A direction is suggested but investigation is needed",
        "A concrete next step is identified",
        "The cause and fix location are clearly identified",
      ],
    },
  },
});

const answerValue = (value: unknown): unknown => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const object = value as JsonObject;
  for (const name of ["selected", "choice", "score", "value", "answer", "probability"]) {
    if (object[name] !== undefined) return object[name];
  }
  return value;
};

const answersFrom = (response: unknown): JsonObject => {
  if (response === null || typeof response !== "object" || Array.isArray(response)) return {};
  const object = response as JsonObject;
  for (const candidate of [object.answers, object.data, object.result]) {
    if (candidate !== null && typeof candidate === "object" && !Array.isArray(candidate)) {
      const nested = candidate as JsonObject;
      if (nested.answers !== null && typeof nested.answers === "object") {
        return nested.answers as JsonObject;
      }
      return nested;
    }
  }
  return object;
};

const display = (value: unknown): string =>
  typeof value === "string" ? value : `\`${JSON.stringify(value)}\``;

const renderReport = (response: unknown, run: JsonObject): string => {
  const answers = answersFrom(response);
  const name = typeof run.name === "string" ? run.name : "quality validation";
  return [
    "## Jev CI triage",
    "",
    `**Workflow:** ${name}`,
    `**Likely cause:** ${display(answerValue(answers.cause))}`,
    `**Evidence sufficient:** ${display(answerValue(answers.evidence_sufficient))}`,
    `**Actionability:** ${display(answerValue(answers.actionability))}`,
    "",
    "> Advisory only. Required repository quality gates remain authoritative.",
  ].join("\n");
};

const main = (): void => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const run = readObject(arguments_.run);
  const changedFiles = readText(arguments_.changedFiles)
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
  const request = buildRequest({
    changedFiles,
    failedLogs: readText(arguments_.logs),
    run,
  });

  if (arguments_.response === undefined) {
    process.stdout.write(`${JSON.stringify(request, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${renderReport(readObject(arguments_.response), run)}\n`);
};

main();
