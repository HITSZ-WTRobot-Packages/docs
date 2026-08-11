import { createHash } from "node:crypto";
import path from "node:path";

import { XMLParser } from "fast-xml-parser";
import { SyntaxValidator } from "fast-xml-validator";

import { branchUpstreamUrl } from "../sources/upstream-url";
import { DoxygenDiagnostic } from "./diagnostic";
import type { ApiTarget } from "./ownership";
import {
  ApiReferenceSchema,
  type ApiAccess,
  type ApiEnumValue,
  type ApiInheritanceRelation,
  type ApiLocation,
  type ApiMemberMetadata,
  type ApiReference,
  type ApiSymbol,
  type ApiSymbolKind,
} from "./schema";

type XmlRecord = Record<string, unknown>;

export type DoxygenCompoundIndex = {
  refId: string;
  kind: string;
};

export type DoxygenXmlDocuments = {
  indexXml: string;
  compounds: ReadonlyMap<string, string>;
};

type SymbolCandidate = {
  rawId: string;
  rawParentId: string | null;
  rawReferences: string[];
  rawInheritance: RawInheritanceRelation[];
  kind: ApiSymbolKind;
  name: string;
  qualifiedName: string;
  signature: string;
  description: string;
  location: ApiLocation | null;
  member: ApiMemberMetadata | null;
  enumValues: ApiEnumValue[];
};

type RawInheritanceRelation = {
  baseRawId: string | null;
  baseQualifiedName: string;
  access: ApiAccess;
  virtual: boolean;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  parseTagValue: false,
  trimValues: true,
});

const supportedCompoundKinds = new Set(["namespace", "class", "struct", "union", "file"]);
const supportedMemberKinds = new Set(["function", "enum", "typedef", "variable", "define"]);

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is XmlRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): XmlRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  return isRecord(value) ? [value] : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function attribute(record: XmlRecord, name: string): string {
  return stringValue(record[`@${name}`]);
}

function validateAndParse(xml: string, source: string): XmlRecord {
  try {
    SyntaxValidator.validate(xml, {
      multipleRoots: false,
      docType: { maxEntityCount: 0, maxEntitySize: 0 },
    });
  } catch (error) {
    throw new DoxygenDiagnostic(
      "DOXYGEN_XML_INVALID",
      `Doxygen emitted invalid XML: ${source}`,
      {
        path: source,
      },
      { cause: error },
    );
  }
  const parsed: unknown = parser.parse(xml);
  if (!isRecord(parsed)) {
    throw new DoxygenDiagnostic(
      "DOXYGEN_XML_INVALID",
      `Doxygen XML has no document root: ${source}`,
      {
        path: source,
      },
    );
  }
  return parsed;
}

function xmlText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(xmlText).filter(Boolean).join(" ");
  }
  if (!isRecord(value)) {
    return "";
  }
  return Object.entries(value)
    .filter(([key]) => !key.startsWith("@"))
    .map(([, child]) => xmlText(child))
    .filter(Boolean)
    .join(" ");
}

function normalizedText(value: unknown): string {
  return xmlText(value).replace(/\s+/gu, " ").trim();
}

function description(record: XmlRecord): string {
  const sections = [
    normalizedText(record.briefdescription),
    normalizedText(record.detaileddescription),
  ].filter(Boolean);
  return [...new Set(sections)].join("\n\n");
}

function collectRawReferences(value: unknown, result = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const child of value) {
      collectRawReferences(child, result);
    }
  } else if (isRecord(value)) {
    const refId = attribute(value, "refid");
    if (refId) {
      result.add(refId);
    }
    for (const child of Object.values(value)) {
      collectRawReferences(child, result);
    }
  }
  return result;
}

function positiveInteger(value: string): number | null {
  if (!/^\d+$/u.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
}

function matchInputPath(rawPath: string, moduleRoot: string, inputPaths: readonly string[]) {
  if (!rawPath) {
    return null;
  }
  const normalizedRaw = rawPath.replaceAll("\\", "/").replace(/^\.\//u, "");
  const relative = path.isAbsolute(rawPath)
    ? path.relative(moduleRoot, rawPath).replaceAll(path.sep, "/")
    : normalizedRaw;
  const exact = inputPaths.find(
    (inputPath) => inputPath === relative || inputPath === normalizedRaw,
  );
  if (exact) {
    return exact;
  }
  const suffixMatches = inputPaths.filter(
    (inputPath) => normalizedRaw === inputPath || normalizedRaw.endsWith(`/${inputPath}`),
  );
  return suffixMatches.length === 1 ? suffixMatches[0] : null;
}

function location(value: unknown, target: ApiTarget, moduleRoot: string): ApiLocation | null {
  const record = records(value)[0];
  if (!record) {
    return null;
  }
  const sourcePath = matchInputPath(attribute(record, "file"), moduleRoot, target.inputPaths);
  if (!sourcePath) {
    return null;
  }
  const line = positiveInteger(attribute(record, "line"));
  const column = positiveInteger(attribute(record, "column"));
  const sourceUrl = `${branchUpstreamUrl(target.module, "blob", sourcePath)}${line ? `#L${line}` : ""}`;
  return { path: sourcePath, line, column, sourceUrl };
}

function symbolKind(rawKind: string): ApiSymbolKind | null {
  if (supportedCompoundKinds.has(rawKind) || supportedMemberKinds.has(rawKind)) {
    if (
      rawKind === "namespace" ||
      rawKind === "class" ||
      rawKind === "struct" ||
      rawKind === "union" ||
      rawKind === "function" ||
      rawKind === "enum" ||
      rawKind === "typedef" ||
      rawKind === "variable" ||
      rawKind === "file" ||
      rawKind === "define"
    ) {
      return rawKind;
    }
  }
  return null;
}

function apiAccess(rawAccess: string): ApiAccess | null {
  if (rawAccess === "public" || rawAccess === "protected" || rawAccess === "private") {
    return rawAccess;
  }
  return null;
}

function inheritanceRelations(compound: XmlRecord): RawInheritanceRelation[] {
  return records(compound.basecompoundref)
    .flatMap((base) => {
      const baseQualifiedName = normalizedText(base);
      const access = apiAccess(attribute(base, "prot"));
      const virtualAttribute = attribute(base, "virt");
      if (!baseQualifiedName) return [];
      if (!access || (virtualAttribute !== "virtual" && virtualAttribute !== "non-virtual")) {
        throw new DoxygenDiagnostic(
          "DOXYGEN_XML_INVALID",
          `Doxygen inheritance metadata is invalid for base type: ${baseQualifiedName}`,
        );
      }
      return [
        {
          baseRawId: attribute(base, "refid") || null,
          baseQualifiedName,
          access,
          virtual: virtualAttribute === "virtual",
        },
      ];
    })
    .sort(
      (left, right) =>
        compareStrings(left.baseQualifiedName, right.baseQualifiedName) ||
        compareStrings(left.access, right.access) ||
        Number(left.virtual) - Number(right.virtual),
    );
}

function memberMetadata(member: XmlRecord, parent: SymbolCandidate | null): ApiMemberMetadata {
  const parentOwnsAccess =
    parent?.kind === "class" || parent?.kind === "struct" || parent?.kind === "union";
  const rawVirtual = attribute(member, "virt");
  return {
    access: parentOwnsAccess ? apiAccess(attribute(member, "prot")) : null,
    static: attribute(member, "static") === "yes",
    virtual: rawVirtual === "pure-virtual" ? "pure" : rawVirtual === "virtual" ? "virtual" : "none",
    const: attribute(member, "const") === "yes",
  };
}

function enumValues(record: XmlRecord): ApiEnumValue[] {
  return records(record.enumvalue)
    .map((value) => ({
      name: normalizedText(value.name),
      initializer: normalizedText(value.initializer),
      description: description(value),
    }))
    .filter((value) => value.name)
    .sort((left, right) => compareStrings(left.name, right.name));
}

function compoundCandidate(
  compound: XmlRecord,
  kind: ApiSymbolKind,
  target: ApiTarget,
  moduleRoot: string,
): SymbolCandidate | null {
  const rawId = attribute(compound, "id");
  let name = normalizedText(compound.compoundname);
  const compoundLocation = location(compound.location, target, moduleRoot);
  if (kind === "file" && compoundLocation) {
    name = compoundLocation.path;
  }
  if (!rawId || !name) {
    return null;
  }
  return {
    rawId,
    rawParentId: null,
    rawReferences: [...collectRawReferences(compound)].sort(compareStrings),
    rawInheritance: inheritanceRelations(compound),
    kind,
    name,
    qualifiedName: name,
    signature: "",
    description: description(compound),
    location: compoundLocation,
    member: null,
    enumValues: [],
  };
}

function memberCandidate(
  member: XmlRecord,
  parent: SymbolCandidate | null,
  target: ApiTarget,
  moduleRoot: string,
): SymbolCandidate | null {
  const kind = symbolKind(attribute(member, "kind"));
  const rawId = attribute(member, "id");
  const name = normalizedText(member.name);
  if (!kind || !supportedMemberKinds.has(kind) || !rawId || !name) {
    return null;
  }
  const qualifiedName =
    normalizedText(member.qualifiedname) ||
    (parent && parent.kind !== "file" ? `${parent.qualifiedName}::${name}` : name);
  const definition = normalizedText(member.definition);
  const args = normalizedText(member.argsstring);
  return {
    rawId,
    rawParentId: parent?.rawId ?? null,
    rawReferences: [...collectRawReferences(member)].sort(compareStrings),
    rawInheritance: [],
    kind,
    name,
    qualifiedName,
    signature: [definition, args].filter(Boolean).join(" ").replace(/\s+/gu, " ").trim(),
    description: description(member),
    location: location(member.location, target, moduleRoot),
    member: memberMetadata(member, parent),
    enumValues: kind === "enum" ? enumValues(member) : [],
  };
}

function candidatesFromCompound(
  document: XmlRecord,
  target: ApiTarget,
  moduleRoot: string,
): SymbolCandidate[] {
  const root = records(document.doxygen)[0];
  const compound = root ? records(root.compounddef)[0] : undefined;
  if (!compound) {
    return [];
  }
  const kind = symbolKind(attribute(compound, "kind"));
  if (!kind || !supportedCompoundKinds.has(kind)) {
    return [];
  }
  const parent = compoundCandidate(compound, kind, target, moduleRoot);
  const candidates = parent ? [parent] : [];
  for (const section of records(compound.sectiondef)) {
    for (const member of records(section.memberdef)) {
      const candidate = memberCandidate(member, parent, target, moduleRoot);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

function stableCandidateKey(candidate: SymbolCandidate): string {
  return [
    candidate.kind,
    candidate.qualifiedName,
    candidate.signature,
    candidate.location?.path ?? "",
    candidate.location?.line ?? "",
  ].join("\u0000");
}

function stableSymbolId(target: ApiTarget, candidate: SymbolCandidate): string {
  const digest = createHash("sha256")
    .update(`${target.targetKind}\u0000${target.targetId}\u0000${stableCandidateKey(candidate)}`)
    .digest("hex")
    .slice(0, 16);
  return `api-${candidate.kind}-${digest}`;
}

function preferCandidate(left: SymbolCandidate, right: SymbolCandidate): SymbolCandidate {
  const leftScore = Number(Boolean(left.description)) + Number(Boolean(left.location));
  const rightScore = Number(Boolean(right.description)) + Number(Boolean(right.location));
  if (rightScore > leftScore) {
    return right;
  }
  return left;
}

function mergeCandidates(left: SymbolCandidate, right: SymbolCandidate): SymbolCandidate {
  const preferred = preferCandidate(left, right);
  const inheritanceByKey = new Map(
    [...left.rawInheritance, ...right.rawInheritance].map((relation) => [
      [
        relation.baseRawId ?? "",
        relation.baseQualifiedName,
        relation.access,
        String(relation.virtual),
      ].join("\u0000"),
      relation,
    ]),
  );
  return {
    ...preferred,
    rawReferences: [...new Set([...left.rawReferences, ...right.rawReferences])].sort(
      compareStrings,
    ),
    rawInheritance: [...inheritanceByKey.values()].sort(
      (first, second) =>
        compareStrings(first.baseQualifiedName, second.baseQualifiedName) ||
        compareStrings(first.access, second.access) ||
        Number(first.virtual) - Number(second.virtual),
    ),
  };
}

function normalizeCandidates(
  target: ApiTarget,
  candidates: readonly SymbolCandidate[],
): { symbols: ApiSymbol[]; inheritanceRelations: ApiInheritanceRelation[] } {
  const byKey = new Map<string, SymbolCandidate>();
  const rawToKey = new Map<string, string>();
  for (const candidate of [...candidates].sort((left, right) =>
    compareStrings(left.rawId, right.rawId),
  )) {
    const key = stableCandidateKey(candidate);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeCandidates(existing, candidate) : candidate);
    rawToKey.set(candidate.rawId, key);
  }
  const keyToId = new Map(
    [...byKey].map(([key, candidate]) => [key, stableSymbolId(target, candidate)]),
  );
  const rawToId = new Map(
    [...rawToKey].flatMap(([rawId, key]) => {
      const id = keyToId.get(key);
      return id ? [[rawId, id] as const] : [];
    }),
  );

  function inferredOwnerId(candidate: SymbolCandidate): string | null {
    if (
      candidate.rawParentId !== null ||
      (candidate.kind !== "class" && candidate.kind !== "struct" && candidate.kind !== "union")
    ) {
      return null;
    }
    const owners = [...byKey.entries()]
      .filter(
        ([, possibleOwner]) =>
          possibleOwner !== candidate &&
          (possibleOwner.kind === "namespace" ||
            possibleOwner.kind === "class" ||
            possibleOwner.kind === "struct" ||
            possibleOwner.kind === "union") &&
          candidate.qualifiedName.startsWith(`${possibleOwner.qualifiedName}::`),
      )
      .sort(
        ([, left], [, right]) =>
          right.qualifiedName.length - left.qualifiedName.length ||
          compareStrings(left.qualifiedName, right.qualifiedName),
      );
    const ownerKey = owners[0]?.[0];
    return ownerKey ? (keyToId.get(ownerKey) ?? null) : null;
  }

  const symbols = [...byKey.entries()]
    .flatMap(([key, candidate]) => {
      const id = keyToId.get(key);
      if (!id) {
        return [];
      }
      const parentId = candidate.rawParentId
        ? (rawToId.get(candidate.rawParentId) ?? null)
        : inferredOwnerId(candidate);
      const references = [
        ...new Set(
          candidate.rawReferences.flatMap((rawId) => {
            const reference = rawToId.get(rawId);
            return reference && reference !== id ? [reference] : [];
          }),
        ),
      ].sort(compareStrings);
      return [
        {
          id,
          anchor: id,
          kind: candidate.kind,
          name: candidate.name,
          qualifiedName: candidate.qualifiedName,
          signature: candidate.signature,
          description: candidate.description,
          location: candidate.location,
          parentId,
          member: candidate.member,
          references,
          enumValues: candidate.enumValues,
        },
      ];
    })
    .sort(
      (left, right) =>
        compareStrings(left.qualifiedName, right.qualifiedName) ||
        compareStrings(left.kind, right.kind) ||
        compareStrings(left.signature, right.signature) ||
        compareStrings(left.id, right.id),
    );
  const relationByKey = new Map<string, ApiInheritanceRelation>();
  for (const [key, candidate] of byKey) {
    const derivedId = keyToId.get(key);
    if (!derivedId || (candidate.kind !== "class" && candidate.kind !== "struct")) continue;
    for (const relation of candidate.rawInheritance) {
      const normalized = {
        kind: "inherits" as const,
        derivedId,
        baseId: relation.baseRawId ? (rawToId.get(relation.baseRawId) ?? null) : null,
        baseQualifiedName: relation.baseQualifiedName,
        access: relation.access,
        virtual: relation.virtual,
      };
      const relationKey = [
        normalized.derivedId,
        normalized.baseId ?? "",
        normalized.baseQualifiedName,
        normalized.access,
        String(normalized.virtual),
      ].join("\u0000");
      relationByKey.set(relationKey, normalized);
    }
  }
  const normalizedRelations = [...relationByKey.values()].sort(
    (left, right) =>
      compareStrings(left.derivedId, right.derivedId) ||
      compareStrings(left.baseQualifiedName, right.baseQualifiedName) ||
      compareStrings(left.access, right.access) ||
      Number(left.virtual) - Number(right.virtual),
  );
  return { symbols, inheritanceRelations: normalizedRelations };
}

export function parseDoxygenIndex(indexXml: string): DoxygenCompoundIndex[] {
  const document = validateAndParse(indexXml, "index.xml");
  const root = records(document.doxygenindex)[0];
  if (!root) {
    throw new DoxygenDiagnostic(
      "DOXYGEN_XML_INVALID",
      "Doxygen index.xml is missing its doxygenindex root.",
      { path: "index.xml" },
    );
  }
  const compounds = records(root.compound)
    .map((compound) => ({
      refId: attribute(compound, "refid"),
      kind: attribute(compound, "kind"),
    }))
    .filter((compound) => compound.refId && supportedCompoundKinds.has(compound.kind))
    .sort((left, right) => compareStrings(left.refId, right.refId));
  const unsafe = compounds.find(
    (compound) =>
      compound.refId === "." ||
      compound.refId === ".." ||
      !/^[A-Za-z0-9_.-]+$/u.test(compound.refId),
  );
  if (unsafe) {
    throw new DoxygenDiagnostic(
      "DOXYGEN_XML_INVALID",
      `Doxygen index contains an unsafe compound reference: ${unsafe.refId}`,
      { path: "index.xml" },
    );
  }
  return compounds;
}

export function normalizeDoxygenXml(
  target: ApiTarget,
  moduleRoot: string,
  documents: DoxygenXmlDocuments,
): ApiReference {
  const candidates: SymbolCandidate[] = [];
  for (const compound of parseDoxygenIndex(documents.indexXml)) {
    const xml = documents.compounds.get(compound.refId);
    if (!xml) {
      throw new DoxygenDiagnostic(
        "DOXYGEN_XML_MISSING",
        `Doxygen compound XML is missing: ${compound.refId}.xml`,
        { module: target.module.id, package: target.displayName, path: `${compound.refId}.xml` },
      );
    }
    const document = validateAndParse(xml, `${compound.refId}.xml`);
    candidates.push(...candidatesFromCompound(document, target, moduleRoot));
  }
  const { symbols, inheritanceRelations } = normalizeCandidates(target, candidates);
  const meaningfulSymbols = symbols.filter((symbol) => symbol.kind !== "file");
  const undocumentedSymbols = meaningfulSymbols.filter((symbol) => !symbol.description);
  const warnings = [];
  let status: ApiReference["status"] = "complete";
  if (meaningfulSymbols.length === 0) {
    status = "empty";
    warnings.push({
      code: "API_SYMBOLS_MISSING" as const,
      message: `No public API symbols were found for ${target.displayName}.`,
    });
  } else if (undocumentedSymbols.length > 0) {
    status = "sparse";
    warnings.push({
      code: "API_DOCUMENTATION_SPARSE" as const,
      message: `${undocumentedSymbols.length} of ${meaningfulSymbols.length} public API symbols have no description.`,
    });
  }
  return ApiReferenceSchema.parse({
    targetKind: target.targetKind,
    targetId: target.targetId,
    displayName: target.displayName,
    moduleId: target.module.id,
    packageSlug: target.packageSlug,
    sourceBranch: target.module.branch,
    inputPaths: target.inputPaths,
    status,
    warnings,
    symbols,
    inheritanceRelations,
    symbolCount: symbols.length,
    documentedSymbolCount: symbols.filter((symbol) => symbol.description).length,
  });
}
