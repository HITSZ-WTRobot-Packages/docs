import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { execa } from "execa";

import { loadPackageCatalog } from "../catalog/loader";
import { readSourceManifest } from "../sources/manifest";
import { readVerifiedSnapshotFile } from "../sources/reader";
import { DoxygenDiagnostic } from "./diagnostic";
import { absoluteSnapshotInput, buildApiTargets, type ApiTarget } from "./ownership";
import { ApiCatalogSchema, ApiReferenceSchema, type ApiCatalog, type ApiReference } from "./schema";
import { normalizeDoxygenXml, parseDoxygenIndex } from "./xml";

const DOXYGEN_TIMEOUT_MS = 120_000;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function doxyfileValue(value: string): string {
  return `"${value.replaceAll("\\", "/").replaceAll('"', '\\"')}"`;
}

function buildDoxyfile(target: ApiTarget, outputRoot: string, sourcesRoot: string): string {
  const moduleRoot = path.resolve(sourcesRoot, "modules", target.module.id);
  const inputs = target.inputPaths.map((inputPath) =>
    doxyfileValue(absoluteSnapshotInput(sourcesRoot, target, inputPath)),
  );
  return [
    "DOXYFILE_ENCODING = UTF-8",
    `PROJECT_NAME = ${doxyfileValue(target.displayName)}`,
    `PROJECT_NUMBER = ${doxyfileValue(target.revisionLabel)}`,
    `OUTPUT_DIRECTORY = ${doxyfileValue(outputRoot)}`,
    "CREATE_SUBDIRS = NO",
    "ALLOW_UNICODE_NAMES = YES",
    "OUTPUT_LANGUAGE = English",
    "BRIEF_MEMBER_DESC = YES",
    "REPEAT_BRIEF = NO",
    "ALWAYS_DETAILED_SEC = NO",
    "FULL_PATH_NAMES = YES",
    `STRIP_FROM_PATH = ${doxyfileValue(moduleRoot)}`,
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
    "FILE_PATTERNS = *.c *.cc *.cpp *.cxx *.h *.hh *.hpp *.hxx",
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
    moduleSha: target.module.sha,
    revisionLabel: target.revisionLabel,
    inputPaths: target.inputPaths,
    status: "failed",
    warnings: [
      {
        code: warningCode,
        message: `${warningCode}: API extraction failed for ${target.displayName}; the remaining references are still available.`,
      },
    ],
    symbols: [],
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
    moduleSha: target.module.sha,
    revisionLabel: target.revisionLabel,
    inputPaths: [],
    status: "empty",
    warnings: [
      {
        code: "API_INPUT_MISSING",
        message: `No synchronized C or C++ inputs belong to ${target.displayName}.`,
      },
    ],
    symbols: [],
    symbolCount: 0,
    documentedSymbolCount: 0,
  });
}

async function readDoxygenVersionLock(repositoryRoot: string): Promise<string> {
  const versionPath = path.join(repositoryRoot, ".doxygen-version");
  let version: string;
  try {
    version = (await readFile(versionPath, "utf8")).trim();
  } catch (error) {
    throw new DoxygenDiagnostic(
      "DOXYGEN_VERSION_LOCK_MISSING",
      "The repository Doxygen version lock is missing or unreadable.",
      { path: ".doxygen-version" },
      { cause: error },
    );
  }
  if (!/^\d+\.\d+\.\d+$/u.test(version)) {
    throw new DoxygenDiagnostic(
      "DOXYGEN_VERSION_LOCK_INVALID",
      "The repository Doxygen version lock must contain an exact semantic version.",
      { path: ".doxygen-version" },
    );
  }
  return version;
}

async function assertDoxygenVersion(repositoryRoot: string, executable: string): Promise<string> {
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
        hint: "Install the exact version recorded in .doxygen-version and retry generation.",
      },
      { cause: error },
    );
  }
  const actualVersion = /^(\d+\.\d+\.\d+)(?: \([0-9a-f]{40}\))?$/u.exec(reportedVersion)?.[1];
  if (actualVersion !== expectedVersion) {
    throw new DoxygenDiagnostic(
      "DOXYGEN_VERSION_MISMATCH",
      `Doxygen ${expectedVersion} is required, but ${reportedVersion || "an unknown version"} was found.`,
      {
        expectedVersion,
        actualVersion: reportedVersion,
        hint: "Use the exact version recorded in .doxygen-version locally and in CI.",
      },
    );
  }
  return actualVersion;
}

async function runDoxygenTarget(
  repositoryRoot: string,
  sourcesRoot: string,
  temporaryRoot: string,
  executable: string,
  target: ApiTarget,
): Promise<ApiReference> {
  if (target.inputPaths.length === 0) {
    return noInputReference(target);
  }
  const targetDirectory = path.join(
    temporaryRoot,
    `${target.targetKind}-${target.module.id}-${target.targetId}`,
  );
  await mkdir(targetDirectory, { recursive: true });
  const configPath = path.join(targetDirectory, "Doxyfile");
  await writeFile(configPath, buildDoxyfile(target, targetDirectory, sourcesRoot), "utf8");
  try {
    await execa(executable, [configPath], {
      cwd: repositoryRoot,
      timeout: DOXYGEN_TIMEOUT_MS,
    });
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
  const moduleRoot = path.resolve(sourcesRoot, "modules", target.module.id);
  return normalizeDoxygenXml(target, moduleRoot, { indexXml, compounds });
}

export type LoadApiCatalogOptions = {
  repositoryRoot?: string;
  executable?: string;
};

export async function loadApiCatalog(options: LoadApiCatalogOptions = {}): Promise<ApiCatalog> {
  const repositoryRoot = options.repositoryRoot ?? path.resolve(import.meta.dirname, "../../..");
  const executable = options.executable ?? "doxygen";
  const sourcesRoot = path.join(repositoryRoot, "sources");
  const [doxygenVersion, sourceManifest, packageCatalog] = await Promise.all([
    assertDoxygenVersion(repositoryRoot, executable),
    readSourceManifest(sourcesRoot),
    loadPackageCatalog(repositoryRoot),
  ]);

  await Promise.all(
    sourceManifest.modules.flatMap((module) =>
      module.files
        .filter((file) => file.kind === "source")
        .map((file) => readVerifiedSnapshotFile(sourcesRoot, module, file)),
    ),
  );

  const targets = buildApiTargets(sourceManifest, packageCatalog);
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "wtr-docs-doxygen-"));
  const references: ApiReference[] = [];
  try {
    for (const target of targets) {
      try {
        references.push(
          await runDoxygenTarget(repositoryRoot, sourcesRoot, temporaryRoot, executable, target),
        );
      } catch (error) {
        references.push(failedReference(target, error));
      }
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  return ApiCatalogSchema.parse({
    formatVersion: 1,
    doxygenVersion,
    references: references.sort(
      (left, right) =>
        compareStrings(left.moduleId, right.moduleId) ||
        compareStrings(left.targetKind, right.targetKind) ||
        compareStrings(left.targetId, right.targetId),
    ),
  });
}

export function serializeApiCatalog(catalog: ApiCatalog): string {
  return `${JSON.stringify(ApiCatalogSchema.parse(catalog), null, 2)}\n`;
}
