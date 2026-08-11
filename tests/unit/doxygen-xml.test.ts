import { describe, expect, test } from "bun:test";

import type { ApiTarget } from "../../src/lib/doxygen/ownership";
import { ApiReferenceSchema } from "../../src/lib/doxygen/schema";
import { normalizeDoxygenXml, parseDoxygenIndex } from "../../src/lib/doxygen/xml";

const target: ApiTarget = {
  targetKind: "package",
  targetId: "fixture",
  displayName: "Fixture",
  module: {
    id: "Fixture",
    displayName: "Fixture",
    repository: "https://github.com/example/fixture.git",
    branch: "main",
    sha: "a".repeat(40),
    shortSha: "a".repeat(12),
    producerFingerprint: "b".repeat(64),
    totalBytes: 0,
    files: [],
    artifacts: [
      { path: "api-catalog.json", bytes: 0, sha256: "c".repeat(64), kind: "api-catalog" },
      {
        path: "package-catalog.json",
        bytes: 0,
        sha256: "d".repeat(64),
        kind: "package-catalog",
      },
    ],
    references: [],
    licenseFiles: [],
    warnings: [],
  },
  packageSlug: "fixture",
  projectNumber: "1.0.0",
  inputPaths: ["fixture.hpp"],
};

describe("Doxygen XML boundary", () => {
  test("accepts supported compounds with safe deterministic references", () => {
    const compounds = parseDoxygenIndex(`<?xml version="1.0"?>
      <doxygenindex>
        <compound refid="widget_8hpp" kind="file"><name>widget.hpp</name></compound>
        <compound refid="classfixture_1_1Widget" kind="class"><name>fixture::Widget</name></compound>
        <compound refid="dir_packages" kind="dir"><name>packages</name></compound>
      </doxygenindex>`);
    expect(compounds).toEqual([
      { refId: "classfixture_1_1Widget", kind: "class" },
      { refId: "widget_8hpp", kind: "file" },
    ]);
  });

  test("rejects malformed XML and path-like compound references", () => {
    expect(() => parseDoxygenIndex("<doxygenindex><compound></doxygenindex>")).toThrow();
    expect(() =>
      parseDoxygenIndex(
        '<doxygenindex><compound refid="../../outside" kind="file" /></doxygenindex>',
      ),
    ).toThrow();
  });

  test("normalizes external bases and polymorphic member metadata", () => {
    const reference = normalizeDoxygenXml(target, "/tmp/fixture", {
      indexXml: `<?xml version="1.0"?>
        <doxygenindex>
          <compound refid="classfixture_1_1ExternalDerived" kind="class">
            <name>fixture::ExternalDerived</name>
          </compound>
        </doxygenindex>`,
      compounds: new Map([
        [
          "classfixture_1_1ExternalDerived",
          `<?xml version="1.0"?>
            <doxygen>
              <compounddef id="classfixture_1_1ExternalDerived" kind="class">
                <compoundname>fixture::ExternalDerived</compoundname>
                <basecompoundref prot="public" virt="non-virtual">sdk::ExternalBase</basecompoundref>
                <sectiondef kind="protected-func">
                  <memberdef kind="function" id="classfixture_1_1ExternalDerived_1a1" prot="protected" static="no" const="yes" virt="pure-virtual">
                    <definition>virtual void fixture::ExternalDerived::update</definition>
                    <argsstring>() const =0</argsstring>
                    <name>update</name>
                    <qualifiedname>fixture::ExternalDerived::update</qualifiedname>
                    <location file="fixture.hpp" line="9" column="3" />
                  </memberdef>
                </sectiondef>
                <location file="fixture.hpp" line="4" column="1" />
              </compounddef>
            </doxygen>`,
        ],
      ]),
    });

    const derived = reference.symbols.find(
      (symbol) => symbol.qualifiedName === "fixture::ExternalDerived",
    );
    if (!derived) throw new Error("Expected the derived class fixture.");
    expect(reference.inheritanceRelations).toEqual([
      {
        kind: "inherits",
        derivedId: derived.id,
        baseId: null,
        baseQualifiedName: "sdk::ExternalBase",
        access: "public",
        virtual: false,
      },
    ]);
    expect(
      reference.symbols.find(
        (symbol) => symbol.qualifiedName === "fixture::ExternalDerived::update",
      )?.member,
    ).toEqual({ access: "protected", static: false, virtual: "pure", const: true });

    const relation = reference.inheritanceRelations[0];
    if (!relation) throw new Error("Expected the external inheritance relation fixture.");
    expect(() =>
      ApiReferenceSchema.parse({
        ...reference,
        inheritanceRelations: [{ ...relation, derivedId: "missing-derived" }],
      }),
    ).toThrow();
  });
});
