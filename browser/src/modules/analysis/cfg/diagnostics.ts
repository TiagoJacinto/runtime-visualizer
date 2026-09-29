import * as ts from "typescript";

import type { GraphDiagnostic, SourceLocation } from "./types.ts";

export interface SourceProject {
  readonly source: string;
  readonly filePath: string;
  readonly files?: Readonly<Record<string, string>>;
}

interface ProjectProgram {
  readonly program: ts.Program;
  readonly sources: Map<string, string>;
  readonly selectedPath: string;
}
/** Compiler inputs that form part of an analysis workspace manifest. */
export const analysisCompilerOptions: Readonly<ts.CompilerOptions> = {
  allowJs: false,
  jsx: ts.JsxEmit.Preserve,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  target: ts.ScriptTarget.ESNext,
};
const virtualPath = (filePath: string): string => {
  const parts = filePath
    .split(/[\\/]/u)
    .filter((part) => part !== "" && part !== "." && part !== "..");
  return `/runtime-visualizer/${parts.join("/") || "inline.ts"}`;
};
const normalize = (value: string): string => {
  const segments = value.replaceAll("\\\\", "/").split("/");
  const result: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      result.pop();
    } else {
      result.push(segment);
    }
  }
  return `${value.startsWith("/") ? "/" : ""}${result.join("/")}`;
};
const basename = (value: string): string =>
  value.replaceAll("\\\\", "/").split("/").at(-1) ?? value;
const dirname = (value: string): string => {
  const normalized = normalize(value);
  const index = normalized.lastIndexOf("/");
  return index < 1 ? "/" : normalized.slice(0, index);
};
const typeScriptLibraryUrls = new Map(
  Object.entries(
    import.meta.glob<string>(
      [
        "../../../../node_modules/typescript/lib/lib.es*.d.ts",
        "../../../../node_modules/typescript/lib/lib.dom*.d.ts",
        "../../../../node_modules/typescript/lib/lib.decorators*.d.ts",
        "../../../../node_modules/typescript/lib/lib.scripthost.d.ts",
        "../../../../node_modules/typescript/lib/lib.webworker.importscripts.d.ts",
      ],
      { eager: true, import: "default", query: "?url" }
    )
  ).map(([path, url]) => [basename(path), url])
);
const typeScriptLibraryDirectory =
  ts.sys === undefined
    ? undefined
    : dirname(ts.getDefaultLibFilePath(analysisCompilerOptions));
const typeScriptLibrariesByRoot = new Map<
  string,
  Promise<ReadonlyMap<string, string>>
>();
const loadTypeScriptLibraries = (
  rootFile: string
): Promise<ReadonlyMap<string, string>> => {
  const cached = typeScriptLibrariesByRoot.get(rootFile);
  if (cached !== undefined) {
    return cached;
  }
  const loading = (async (): Promise<ReadonlyMap<string, string>> => {
    const libraries = new Map<string, string>();
    const requested = new Set<string>();
    const loadLibrary = async (fileName: string): Promise<void> => {
      const name = basename(fileName);
      if (requested.has(name)) {
        return;
      }
      requested.add(name);
      let source: string | undefined;
      if (typeScriptLibraryDirectory === undefined) {
        const url = typeScriptLibraryUrls.get(name);
        if (url === undefined) {
          throw new Error(
            `TypeScript standard library ${name} is missing from the browser build.`
          );
        }
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `Unable to load TypeScript standard library ${name}.`
          );
        }
        source = await response.text();
      } else {
        source = ts.sys.readFile(`${typeScriptLibraryDirectory}/${name}`);
      }
      if (source === undefined) {
        throw new Error(`Unable to read TypeScript standard library ${name}.`);
      }
      libraries.set(name, source);
      const references = new Set<string>();
      for (const match of source.matchAll(
        /<reference\s+lib="(?<name>[^"]+)"/gu
      )) {
        const library = match.groups?.name;
        if (library !== undefined) {
          references.add(`lib.${library}.d.ts`);
        }
      }
      for (const match of source.matchAll(
        /<reference\s+path="(?<path>[^"]+)"/gu
      )) {
        const path = match.groups?.path;
        if (path !== undefined) {
          references.add(basename(path));
        }
      }
      await Promise.all([...references].map(loadLibrary));
    };
    await loadLibrary(rootFile);
    return libraries;
  })();
  typeScriptLibrariesByRoot.set(rootFile, loading);
  return loading;
};
const displayPath = (filePath: string): string => basename(filePath);
const scriptKindFor = (filePath: string): ts.ScriptKind =>
  filePath.toLowerCase().endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
const flatten = (message: string | ts.DiagnosticMessageChain): string =>
  ts.flattenDiagnosticMessageText(message, " ");
const location = (
  file: ts.SourceFile,
  start: number,
  length: number
): SourceLocation => {
  const begin = file.getLineAndCharacterOfPosition(start);
  const end = file.getLineAndCharacterOfPosition(
    Math.min(file.getFullText().length, start + length)
  );
  return {
    end: { column: end.character + 1, line: end.line + 1 },
    start: { column: begin.character + 1, line: begin.line + 1 },
  };
};
const nodeAtPosition = (
  file: ts.SourceFile,
  position: number
): ts.Node | undefined => {
  let match: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (position < node.getStart(file) || position >= node.getEnd()) {
      return;
    }
    match = node;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return match;
};
const ignorableDiagnostic = (diagnostic: ts.Diagnostic): boolean => {
  // Source snippets commonly call project-provided globals that are not part of the upload.
  // Keep unknown types and values visible: only an unresolved function callee is contextual.
  if (
    (diagnostic.code !== 2304 && diagnostic.code !== 2552) ||
    diagnostic.file === undefined ||
    diagnostic.start === undefined
  ) {
    return false;
  }
  const token = nodeAtPosition(diagnostic.file, diagnostic.start);
  return (
    token !== undefined &&
    ts.isCallExpression(token.parent) &&
    token.parent.expression === token
  );
};
const addDiagnostic = (
  diagnostics: GraphDiagnostic[],
  diagnostic: ts.Diagnostic,
  procedure: string,
  dependency: string | undefined,
  reason: string
): void => {
  const message = flatten(diagnostic.messageText);
  if (
    diagnostics.some(
      (existing) =>
        existing.dependency === dependency &&
        existing.reason === reason &&
        existing.message === message
    )
  ) {
    return;
  }
  const base = { message, procedure, reason };
  if (diagnostic.file !== undefined) {
    const diagnosticLocation = location(
      diagnostic.file,
      diagnostic.start ?? 0,
      diagnostic.length ?? 0
    );
    if (dependency === undefined) {
      diagnostics.push({ ...base, location: diagnosticLocation });
    } else {
      diagnostics.push({ ...base, dependency, location: diagnosticLocation });
    }
  } else if (dependency === undefined) {
    diagnostics.push(base);
  } else {
    diagnostics.push({ ...base, dependency });
  }
};
const collectWithDiagnostics = (
  file: ts.SourceFile,
  procedure: string,
  dependency: string | undefined,
  diagnostics: GraphDiagnostic[]
): void => {
  const visit = (node: ts.Node): void => {
    if (
      ts.isWithStatement(node) &&
      !diagnostics.some(
        (diagnostic) =>
          diagnostic.dependency === dependency &&
          diagnostic.reason === "With statement is unsupported" &&
          diagnostic.location?.start.line ===
            file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
      )
    ) {
      const diagnosticLocation = location(
        file,
        node.getStart(file),
        node.getWidth(file)
      );
      if (dependency === undefined) {
        diagnostics.push({
          location: diagnosticLocation,
          procedure,
          reason: "With statement is unsupported",
        });
      } else {
        diagnostics.push({
          dependency,
          location: diagnosticLocation,
          procedure,
          reason: "With statement is unsupported",
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
};
const createProjectProgram = async ({
  source,
  filePath,
  files = {},
}: SourceProject): Promise<ProjectProgram> => {
  const selectedPath = virtualPath(filePath);
  const sources = new Map<string, string>();
  for (const [name, contents] of Object.entries(files)) {
    sources.set(virtualPath(name), contents);
  }
  sources.set(selectedPath, source);
  const compilerOptions = analysisCompilerOptions;
  const libraries = await loadTypeScriptLibraries(
    ts.getDefaultLibFileName(compilerOptions)
  );
  const readFile = (fileName: string): string | undefined =>
    sources.get(normalize(fileName)) ?? libraries.get(basename(fileName));
  const host: ts.CompilerHost = {
    directoryExists: (directoryName) => {
      const directory = normalize(directoryName);
      return (
        directory === "/runtime-visualizer" ||
        [...sources.keys()].some((fileName) =>
          dirname(fileName).startsWith(`${directory}/`)
        )
      );
    },
    fileExists: (fileName) => readFile(fileName) !== undefined,
    getCanonicalFileName: (fileName) => normalize(fileName),
    getCurrentDirectory: () => "/runtime-visualizer",
    getDefaultLibFileName: (options) =>
      `/runtime-visualizer/${ts.getDefaultLibFileName(options)}`,
    getDirectories: () => [],
    getNewLine: () => "\n",
    getSourceFile: (fileName, languageVersion) => {
      const contents = readFile(fileName);
      return contents === undefined
        ? undefined
        : ts.createSourceFile(
            fileName,
            contents,
            languageVersion,
            true,
            scriptKindFor(fileName)
          );
    },
    readFile,
    realpath: normalize,
    resolveModuleNames: (moduleNames, containingFile) =>
      moduleNames.map((moduleName) => {
        if (moduleName.startsWith(".")) {
          const exact = normalize(`${dirname(containingFile)}/${moduleName}`);
          if (sources.has(exact)) {
            return {
              extension:
                scriptKindFor(exact) === ts.ScriptKind.TSX
                  ? ts.Extension.Tsx
                  : ts.Extension.Ts,
              isExternalLibraryImport: false,
              resolvedFileName: exact,
            };
          }
          for (const extension of [".ts", ".tsx", ".d.ts"]) {
            const candidate = normalize(
              `${dirname(containingFile)}/${moduleName}${extension}`
            );
            if (sources.has(candidate)) {
              let resolvedExtension = ts.Extension.Ts;
              if (extension === ".d.ts") {
                resolvedExtension = ts.Extension.Dts;
              } else if (extension === ".tsx") {
                resolvedExtension = ts.Extension.Tsx;
              }
              return {
                extension: resolvedExtension,
                isExternalLibraryImport: false,
                resolvedFileName: candidate,
              };
            }
          }
        }
        return ts.resolveModuleName(
          moduleName,
          containingFile,
          compilerOptions,
          host
        ).resolvedModule;
      }),
    useCaseSensitiveFileNames: () => true,
    writeFile: () => {
      // Analysis runs with noEmit enabled.
    },
  };
  return {
    program: ts.createProgram([selectedPath], compilerOptions, host),
    selectedPath,
    sources,
  };
};
/** Returns the saved source files loaded by the selected file's TypeScript Program. */
export const projectDependencyFiles = async ({
  source,
  filePath,
  files = {},
}: SourceProject): Promise<readonly string[]> => {
  const { program, sources, selectedPath } = await createProjectProgram({
    filePath,
    files,
    source,
  });
  const paths = new Set(
    program.getSourceFiles().map((file) => normalize(file.fileName))
  );
  const dependencies: string[] = [];
  for (const name of sources.keys()) {
    if (!paths.has(name)) {
      continue;
    }
    dependencies.push(
      name === selectedPath
        ? filePath
        : name.replace(/^\/runtime-visualizer\//u, "")
    );
  }
  return dependencies.toSorted((left, right) => left.localeCompare(right));
};
/** Diagnose only the selected Procedure and the dependencies it imports. */
export const diagnoseProject = async (
  project: SourceProject
): Promise<GraphDiagnostic[]> => {
  const { program, sources, selectedPath } =
    await createProjectProgram(project);
  const diagnostics: GraphDiagnostic[] = [];
  for (const file of program.getSourceFiles()) {
    const candidatePath = normalize(file.fileName);
    if (!sources.has(candidatePath)) {
      continue;
    }
    const dependency =
      candidatePath === selectedPath ? undefined : displayPath(candidatePath);
    for (const diagnostic of program.getSyntacticDiagnostics(file)) {
      if (diagnostic.category === ts.DiagnosticCategory.Error) {
        addDiagnostic(
          diagnostics,
          diagnostic,
          project.filePath,
          dependency,
          "Syntax is invalid"
        );
      }
    }
    for (const diagnostic of program.getSemanticDiagnostics(file)) {
      if (
        diagnostic.category !== ts.DiagnosticCategory.Error ||
        ignorableDiagnostic(diagnostic)
      ) {
        continue;
      }
      const reason =
        diagnostic.code === 2307
          ? "Required dependency could not be resolved"
          : "Type checking failed";
      addDiagnostic(
        diagnostics,
        diagnostic,
        project.filePath,
        dependency,
        reason
      );
    }
    collectWithDiagnostics(file, project.filePath, dependency, diagnostics);
  }
  return diagnostics;
};
