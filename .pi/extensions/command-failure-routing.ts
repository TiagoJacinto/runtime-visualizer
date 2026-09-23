import { appendFile, chmod, mkdir, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type {
  ExtensionAPI,
  ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { ask, choice, createTypeSafe } from "pi-typesafe";
import { z } from "zod";

export interface RoutingRoute {
  id: string;
  label: string;
  guidance: string;
}

export interface RoutingCommand {
  name: string;
  pattern: string;
  routes: string[];
  testRoots: string[];
}

export interface RoutingConfig {
  enabled: boolean;
  maxOutputChars: number;
  commands: RoutingCommand[];
  routes: RoutingRoute[];
}

export interface FailureEvidence {
  command: string;
  output: string;
}

export interface EndpointReference {
  method: string;
  path: string;
}

export interface EndpointTestEvidence {
  endpoint: EndpointReference;
  matchingTestCount: number;
  matchingTestPaths: string[];
  scanComplete: boolean;
}

const routeSchema = z.object({
  guidance: z.string().trim().min(1),
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
});

const commandSchema = z.object({
  name: z.string().trim().min(1),
  pattern: z.string().trim().min(1),
  routes: z.array(z.string().trim().min(1)).min(1),
  testRoots: z
    .array(z.string().trim().min(1))
    .min(1)
    .refine((roots) =>
      roots.every(
        (root) => !path.isAbsolute(root) && !root.split(/[\\/]/u).includes("..")
      )
    ),
});

const routingConfigSchema = z
  .object({
    commands: z.array(commandSchema),
    enabled: z.boolean(),
    maxOutputChars: z.number().int().min(1).max(10_000),
    routes: z.array(routeSchema),
  })
  .superRefine((config, context) => {
    const routeIds = new Set(config.routes.map((route) => route.id));
    if (routeIds.size !== config.routes.length) {
      context.addIssue({
        code: "custom",
        message: "Route ids must be unique.",
        path: ["routes"],
      });
    }
    for (const [index, command] of config.commands.entries()) {
      try {
        const pattern = new RegExp(command.pattern, "u");
        if (pattern.source.length === 0) {
          throw new Error("Empty pattern");
        }
      } catch {
        context.addIssue({
          code: "custom",
          message: `Command at index ${index} has an invalid regex pattern.`,
          path: ["commands", index, "pattern"],
        });
      }
      if (new Set(command.routes).size !== command.routes.length) {
        context.addIssue({
          code: "custom",
          message: `Command at index ${index} contains duplicate route ids.`,
          path: ["commands", index, "routes"],
        });
      }
      for (const id of command.routes) {
        if (!routeIds.has(id)) {
          context.addIssue({
            code: "custom",
            message: `Command at index ${index} refers to unknown route "${id}".`,
            path: ["commands", index, "routes"],
          });
        }
      }
    }
  });

export const parseRoutingConfig = (json: string): RoutingConfig | undefined => {
  try {
    const parsed = routingConfigSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export const matchCommand = (
  config: RoutingConfig,
  command: string
): RoutingCommand | undefined =>
  config.commands.find((candidate) =>
    new RegExp(candidate.pattern, "u").test(command)
  );

export const redact = (value: string): string =>
  value
    // oxlint-disable-next-line no-control-regex -- Strip terminal ANSI escape sequences from command output.
    .replaceAll(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "")
    .replaceAll(
      /\b(?<prefix>Bearer\s+)[A-Za-z0-9._~+/=-]+/giu,
      "$<prefix>[REDACTED]"
    )
    .replaceAll(
      /\b(?<prefix>(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\s*[:=]\s*)[^\s,;]+/giu,
      "$<prefix>[REDACTED]"
    )
    .replaceAll(/\b(?:sk|pk)_[A-Za-z0-9_-]{12,}\b/giu, "[REDACTED]");

export const makeFailureEvidence = (
  command: string,
  output: string,
  maxOutputChars: number
): FailureEvidence => ({
  command: redact(command).slice(0, 1000),
  output: redact(output).slice(-maxOutputChars),
});

export const extractEndpoints = (output: string): EndpointReference[] => {
  const endpoints = new Map<string, EndpointReference>();
  for (const match of output.matchAll(
    /\b(?<method>GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(?<path>\/[^\s"'`<>]+)/giu
  )) {
    const method = match.groups?.method?.toUpperCase();
    const endpointPath = match.groups?.path?.replace(/[),.;:]+$/u, "");
    if (!method || !endpointPath) {
      continue;
    }
    endpoints.set(`${method} ${endpointPath}`, { method, path: endpointPath });
    if (endpoints.size >= 8) {
      break;
    }
  }
  return [...endpoints.values()];
};

const testSourcePattern =
  /\.(?:test|spec|unit|integration|e2e|hvut|hvit|hve2e)\.[cm]?[jt]sx?$/iu;

const collectTestFiles = async (
  repositoryRoot: string,
  testRoots: string[]
): Promise<{ files: string[]; scanComplete: boolean }> => {
  const scans = await Promise.all(
    testRoots.map(async (root) => {
      const directory = path.resolve(repositoryRoot, root);
      try {
        const entries = await readdir(directory, {
          recursive: true,
          withFileTypes: true,
        });
        return {
          files: entries
            .filter(
              (entry) =>
                entry.isFile() &&
                testSourcePattern.test(entry.name) &&
                !entry.parentPath.split(path.sep).includes("node_modules") &&
                !entry.parentPath.split(path.sep).includes(".git")
            )
            .map((entry) => path.join(entry.parentPath, entry.name)),
          scanComplete: true,
        };
      } catch {
        return { files: [], scanComplete: false };
      }
    })
  );

  return {
    files: [...new Set(scans.flatMap((scan) => scan.files))],
    scanComplete: scans.every((scan) => scan.scanComplete),
  };
};

export const findEndpointTests = async (
  repositoryRoot: string,
  testRoots: string[],
  output: string
): Promise<EndpointTestEvidence[]> => {
  const endpoints = extractEndpoints(output);
  if (endpoints.length === 0) {
    return [];
  }

  const { files, scanComplete } = await collectTestFiles(
    repositoryRoot,
    testRoots
  );
  const sourceResults = await Promise.all(
    files.map(async (file) => {
      try {
        return { file, source: await readFile(file, "utf-8") };
      } catch {
        return null;
      }
    })
  );
  const complete =
    scanComplete && sourceResults.every((result) => result !== null);
  const matchingPaths = new Map(
    endpoints.map((endpoint) => [
      `${endpoint.method} ${endpoint.path}`,
      new Set<string>(),
    ])
  );

  for (const result of sourceResults) {
    if (!result) {
      continue;
    }
    for (const endpoint of endpoints) {
      if (result.source.includes(endpoint.path)) {
        const key = `${endpoint.method} ${endpoint.path}`;
        matchingPaths
          .get(key)
          ?.add(
            path.relative(repositoryRoot, result.file).split(path.sep).join("/")
          );
      }
    }
  }

  return endpoints.map((endpoint) => {
    const paths = [
      ...(matchingPaths.get(`${endpoint.method} ${endpoint.path}`) ?? []),
    ].toSorted();
    return {
      endpoint,
      matchingTestCount: paths.length,
      matchingTestPaths: paths.slice(0, 20),
      scanComplete: complete,
    };
  });
};

export interface RoutingJudgment {
  options: Record<string, string>;
  state: {
    command: string;
    commandName: string;
    endpointTests: EndpointTestEvidence[];
    failureOutput: string;
  };
}

export interface RoutingLogEntry {
  timestamp: string;
  commandName: string;
  request: { questions: { route: object }; state: RoutingJudgment["state"] };
  response: object;
}

export const commandFailureRoutingLogPath = (
  agentDir = process.env.PI_CODING_AGENT_DIR ||
    path.join(homedir(), ".pi", "agent")
): string => path.join(agentDir, "logs", "command-failure-routing.jsonl");

export const appendRoutingLog = async (
  entry: RoutingLogEntry,
  logPath = commandFailureRoutingLogPath()
): Promise<void> => {
  await mkdir(path.dirname(logPath), { mode: 0o700, recursive: true });
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  await chmod(logPath, 0o600);
};

export const recommendRoute = async (
  config: RoutingConfig,
  command: string,
  output: string,
  judge: (request: RoutingJudgment) => Promise<string | null>,
  endpointTests: EndpointTestEvidence[] = []
): Promise<RoutingRoute | null> => {
  const match = matchCommand(config, command);
  if (!match) {
    return null;
  }

  const routeById = new Map(config.routes.map((route) => [route.id, route]));
  const options: Record<string, string> = {};
  for (const id of match.routes) {
    const route = routeById.get(id);
    if (!route) {
      return null;
    }
    options[route.id] = `${route.label}: ${route.guidance}`;
  }

  const evidence = makeFailureEvidence(command, output, config.maxOutputChars);
  const selectedId = await judge({
    options,
    state: {
      command: evidence.command,
      commandName: match.name,
      endpointTests,
      failureOutput: evidence.output,
    },
  });
  return selectedId ? (routeById.get(selectedId) ?? null) : null;
};

const contentText = (event: ToolResultEvent): string =>
  event.content
    .filter(
      (item): item is { type: "text"; text: string } => item.type === "text"
    )
    .map((item) => item.text)
    .join("\n");

export default function commandFailureRoutingExtension(pi: ExtensionAPI): void {
  let client: ReturnType<typeof createTypeSafe> | undefined;

  pi.on("tool_result", async (event, ctx) => {
    if (!event.isError) {
      return;
    }

    const notify = (content: string, level: "info" | "warning"): void => {
      pi.sendMessage({
        content,
        customType: "command-failure-routing",
        details: { level },
        display: true,
      });
      if (ctx.hasUI) {
        ctx.ui.notify(content, level);
      }
    };

    const parsedCommand = z.string().safeParse(event.input.command);
    if (!parsedCommand.success) {
      return;
    }
    const command = parsedCommand.data;

    let config: RoutingConfig;
    try {
      const configPath = path.join(
        ctx.cwd,
        ".pi",
        "extensions",
        "command-failure-routing.json"
      );
      const parsedConfig = parseRoutingConfig(
        await readFile(configPath, "utf-8")
      );
      if (!parsedConfig) {
        throw new Error("config does not match the required schema");
      }
      config = parsedConfig;
    } catch (error) {
      notify(
        `Command failure routing config is invalid or unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
        "warning"
      );
      return;
    }
    if (!config.enabled) {
      return;
    }

    const match = matchCommand(config, command);
    if (!match) {
      return;
    }
    try {
      if (!client) {
        client = createTypeSafe({
          maxInputBytes: 16_000,
          maxRequests: 10,
          maxUsdPerDay: 0.05,
          timeoutMs: 10_000,
        });
      }
      const activeClient = client;
      const output = contentText(event);
      const endpointTests = await findEndpointTests(
        ctx.cwd,
        match.testRoots,
        output
      );
      const route = await recommendRoute(
        config,
        command,
        output,
        async ({ options, state }) => {
          const request = {
            questions: {
              route: choice(
                "For a 404 endpoint-unreachable failure, choose create only when endpointTests shows a complete scan with zero matching paths; choose delete only when it shows a complete scan with matching paths; otherwise choose uncertain. Do not infer test existence from failure text alone.",
                options
              ),
            },
            state,
          };
          const result = await ask(activeClient, request, {
            timeoutMs: 10_000,
          });
          try {
            await appendRoutingLog({
              commandName: match.name,
              request,
              response: result,
              timestamp: new Date().toISOString(),
            });
          } catch {
            notify(
              `Jev request completed, but its log could not be written to ${commandFailureRoutingLogPath()}.`,
              "warning"
            );
          }
          if (!result.ok) {
            return null;
          }
          return result.answers.route.choice;
        },
        endpointTests
      );

      if (!route) {
        notify(
          "Jev could not classify this failure or returned an unconfigured route; inspect it manually.",
          "warning"
        );
        return;
      }
      notify(
        `Jev route for ${match.name}: ${route.label} (log: ${commandFailureRoutingLogPath()})`,
        "info"
      );
    } catch {
      notify(
        "Jev routing failed; inspect the command failure manually.",
        "warning"
      );
    }
  });
}
