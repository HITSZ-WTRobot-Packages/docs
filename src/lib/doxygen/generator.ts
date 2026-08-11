import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { execa } from "execa";

import type { PackageCatalog } from "../catalog/schema";
import type { ModuleSnapshot } from "../sources/manifest";
import { DoxygenDiagnostic } from "./diagnostic";
import { absoluteModuleInput, buildModuleApiTargets, type ApiTarget } from "./ownership";
import { ApiCatalogSchema, ApiReferenceSchema, type ApiCatalog, type ApiReference } from "./schema";
import { normalizeReportedDoxygenVersion, readDoxygenVersionLock } from "./version";
import { normalizeDoxygenXml, parseDoxygenIndex } from "./xml";

const DOXYGEN_TIMEOUT_MS = 120_000;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function doxyfileValue(value: string): string {
  return `"${value.replaceAll("\\", "/").replaceAll('"', '\\"')}"`;
}

function buildDoxyfile(target: ApiTarget, outputRoot: string, moduleRoot: string): string {
  const inputs = target.inputPaths.map((inputPath) =>
    doxyfileValue(absoluteModuleInput(moduleRoot, target, inputPath)),
  );
  return [
    "DOXYFILE_ENCODING = UTF-8",
    `PROJECT_NAME = ${doxyfileValue(target.displayName)}`,
    `PROJECT_NUMBER = ${doxyfileValue(target.projectNumber)}`,
    `OUTPUT_DIRECTORY = ${doxyfileValue(outputRoot)}`,
    "CREATE_SUBDIRS = NO",
    "ALLOW_UNICODE_NAMES = YES",
    "OUTPUT_LANGUAGE = English",
    "BRIEF_MEMBER_DESC = YES",
    "REPEAT_BRIEF = NO",
    "ALWAYS_DETAILED_SEC = NO",
    "FULL_PATH_NAMES = YES",
    `STRIP_FROM_PATH = ${doxyfileValue(path.resolve(moduleRoot))}`,
    "JAVADOC_AUTOBRIEF = YES",
    "QT_AUTOBRIEF = YES",
    "MULTILINE_CPP_IS_BRIEF = YES",
    "MARKDOWN_SUPPORT = YES",
    "TOC_INCLUDE_HEADINGS = 0",
    "BUILTIN_STL_SUPPORT = NO",
    "EXTRACT_ALL = YES",
    "EXTRACT_PRIVATE = NO",
    "EXTRACT_PACKAGE = NO",
    "EXTRACT_STATIC = YES",
    "EXTRACT_LOCAL_CLASSES = YES",
    "EXTRACT_ANON_NSPACES = YES",
    "HIDE_UNDOC_MEMBERS = NO",
    "HIDE_UNDOC_CLASSES = NO",
    "SHOW_INCLUDE_FILES = NO",
    "INLINE_INFO = NO",
    "SORT_MEMBER_DOCS = YES",
    "SORT_BRIEF_DOCS = YES",
    "SORT_MEMBERS_CTORS_1ST = NO",
    `INPUT = ${inputs.join(" ")}`,
    "INPUT_ENCODING = UTF-8",
    "FILE_PATTERNS = *.c *.cc *.cpp *.cxx *.h *.hh *.hpp *.hxx *.inl *.ipp",
    "RECURSIVE = NO",
    "EXCLUDE_SYMLINKS = YES",
    "SOURCE_BROWSER = NO",
    "INLINE_SOURCES = NO",
    "STRIP_CODE_COMMENTS = YES",
    "REFERENCED_BY_RELATION = YES",
    "REFERENCES_RELATION = YES",
    "REFERENCES_LINK_SOURCE = NO",
    "USE_HTAGS = NO",
    "VERBATIM_HEADERS = NO",
    "CLANG_ASSISTED_PARSING = NO",
    "ENABLE_PREPROCESSING = YES",
    "MACRO_EXPANSION = NO",
    "EXPAND_ONLY_PREDEF = NO",
    "SKIP_FUNCTION_MACROS = YES",
    "HAVE_DOT = NO",
    "QUIET = YES",
    "WARNINGS = YES",
    "WARN_IF_UNDOCUMENTED = NO",
    "WARN_IF_DOC_ERROR = YES",
    "WARN_NO_PARAMDOC = NO",
    "WARN_AS_ERROR = NO",
    "GENERATE_HTML = NO",
    "GENERATE_LATEX = NO",
    "GENERATE_MAN = NO",
    "GENERATE_RTF = NO",
    "GENERATE_XML = YES",
    "XML_OUTPUT = xml",
    "XML_PROGRAMLISTING = NO",
    "GENERATE_DOCBOOK = NO",
    "GENERATE_AUTOGEN_DEF = NO",
    "GENERATE_PERLMOD = NO",
    "",
  ].join("\n");
}

function failedWarningCode(error: unknown): ApiReference["warnings"][number]["code"] {
  if (error instanceof DoxygenDiagnostic) {
    if (
      error.code === "DOXYGEN_OUTPUT_MISSING" ||
      error.code === "DOXYGEN_PROCESS_FAILED" ||
      error.code === "DOXYGEN_XML_INVALID" ||
      error.code === "DOXYGEN_XML_MISSING"
    ) {
      return error.code;
    }
  }
  return "DOXYGEN_TARGET_FAILED";
}

function failedReference(target: ApiTarget, error: unknown): ApiReference {
  const warningCode = failedWarningCode(error);
  return ApiReferenceSchema.parse({
    targetKind: target.targetKind,
    targetId: target.targetId,
    displayName: target.displayName,
    moduleId: target.module.id,
    packageSlug: target.packageSlug,
    sourceBranch: target.module.branch,
    inputPaths: target.inputPaths,
    status: "failed",
    warnings: [
      {
        code: warningCode,
        message: `${warningCode}: API extraction failed for ${target.displayName}; the remaining references are still available.`,
      },
    ],
    symbols: [],
    inheritanceRelations: [],
    symbolCount: 0,
    documentedSymbolCount: 0,
  });
}

function noInputReference(target: ApiTarget): ApiReference {
  return ApiReferenceSchema.parse({
    targetKind: target.targetKind,
    targetId: target.targetId,
    displayName: target.displayName,
    moduleId: target.module.id,
    packageSlug: target.packageSlug,
    sourceBranch: target.module.branch,
    inputPaths: [],
    status: "empty",
    warnings: [
      {
        code: "API_INPUT_MISSING",
        message: `No synchronized C or C++ inputs belong to ${target.displayName}.`,
      },
    ],
    symbols: [],
    inheritanceRelations: [],
    symbolCount: 0,
    documentedSymbolCount: 0,
  });
}

export async function assertDoxygenVersion(
  repositoryRoot: string,
  executable = "doxygen",
): Promise<string> {
  const expectedVersion = await readDoxygenVersionLock(repositoryRoot);
  let reportedVersion: string;
  try {
    const result = await execa(executable, ["--version"], {
      cwd: repositoryRoot,
      timeout: DOXYGEN_TIMEOUT_MS,
    });
    reportedVersion = result.stdout.trim();
  } catch (error) {
    throw new DoxygenDiagnostic(
      "DOXYGEN_TOOL_UNAVAILABLE",
      `Doxygen ${expectedVersion} is required but the executable could not be invoked.`,
      {
        expectedVersion,
        hint: "Install the exact version recorded in .doxygen-version and retry synchronization.",
      },
      { cause: error },
    );
  }
  const actualVersion = normalizeReportedDoxygenVersion(reportedVersion);
  if (actualVersion !== expectedVersion) {
    throw new DoxygenDiagnostic(
      "DOXYGEN_VERSION_MISMATCH",
      `Doxygen ${expectedVersion} is required, but ${reportedVersion || "an unknown version"} was found.`,
      {
        expectedVersion,
        actualVersion: reportedVersion,
        hint: "Use the exact version recorded in .doxygen-version locally and in synchronization CI.",
      },
    );
  }
  return actualVersion;
}

async function runDoxygenTarget(
  repositoryRoot: string,
  moduleRoot: string,
  temporaryRoot: string,
  executable: string,
  target: ApiTarget,
): Promise<ApiReference> {
  if (target.inputPaths.length === 0) return noInputReference(target);
  const targetDirectory = path.join(
    temporaryRoot,
    `${target.targetKind}-${target.module.id}-${target.targetId}`,
  );
  await mkdir(targetDirectory, { recursive: true });
  const configPath = path.join(targetDirectory, "Doxyfile");
  await writeFile(configPath, buildDoxyfile(target, targetDirectory, moduleRoot), "utf8");
  try {
    await execa(executable, [configPath], { cwd: repositoryRoot, timeout: DOXYGEN_TIMEOUT_MS });
  } catch (error) {
    throw new DoxygenDiagnostic(
      "DOXYGEN_PROCESS_FAILED",
      `Doxygen failed while extracting ${target.displayName}.`,
      { module: target.module.id, package: target.displayName },
      { cause: error },
    );
  }
  const xmlRoot = path.join(targetDirectory, "xml");
  let indexXml: string;
  try {
    indexXml = await readFile(path.join(xmlRoot, "index.xml"), "utf8");
  } catch (error) {
    throw new DoxygenDiagnostic(
      "DOXYGEN_OUTPUT_MISSING",
      `Doxygen did not emit index.xml for ${target.displayName}.`,
      { module: target.module.id, package: target.displayName },
      { cause: error },
    );
  }
  const compounds = new Map<string, string>();
  for (const compound of parseDoxygenIndex(indexXml)) {
    try {
      compounds.set(
        compound.refId,
        await readFile(path.join(xmlRoot, `${compound.refId}.xml`), "utf8"),
      );
    } catch (error) {
      throw new DoxygenDiagnostic(
        "DOXYGEN_XML_MISSING",
        `Doxygen compound XML is missing: ${compound.refId}.xml`,
        {
          module: target.module.id,
          package: target.displayName,
          path: `${compound.refId}.xml`,
        },
        { cause: error },
      );
    }
  }
  return normalizeDoxygenXml(target, path.resolve(moduleRoot), { indexXml, compounds });
}

export type GenerateModuleApiCatalogOptions = {
  repositoryRoot: string;
  moduleRoot: string;
  module: ModuleSnapshot;
  packageCatalog: PackageCatalog;
  sourcePaths: readonly string[];
  executable?: string;
  doxygenVersion?: string;
};

export async function generateModuleApiCatalog(
  options: GenerateModuleApiCatalogOptions,
): Promise<ApiCatalog> {
  const executable = options.executable ?? "doxygen";
  const doxygenVersion =
    options.doxygenVersion ?? (await assertDoxygenVersion(options.repositoryRoot, executable));
  const targets = buildModuleApiTargets(
    options.module,
    options.packageCatalog,
    options.sourcePaths,
  );
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "wtr-docs-doxygen-"));
  const references: ApiReference[] = [];
  try {
    for (const target of targets) {
      try {
        references.push(
          await runDoxygenTarget(
            options.repositoryRoot,
            options.moduleRoot,
            temporaryRoot,
            executable,
            target,
          ),
        );
      } catch (error) {
        references.push(failedReference(target, error));
      }
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  return ApiCatalogSchema.parse({
    formatVersion: 3,
    doxygenVersion,
    references: references.sort(
      (left, right) =>
        compareStrings(left.targetKind, right.targetKind) ||
        compareStrings(left.targetId, right.targetId),
    ),
  });
}

export function serializeApiCatalog(catalog: ApiCatalog): string {
  return `${JSON.stringify(ApiCatalogSchema.parse(catalog), null, 2)}\n`;
}
