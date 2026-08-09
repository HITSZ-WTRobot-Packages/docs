import { describe, expect, test } from "bun:test";

import {
  artifactPathIssue,
  credentialSignals,
  pageArtifactPath,
  resourceArtifactPath,
} from "../../scripts/validation/release-contract";

describe("deployment artifact contract", () => {
  test("maps base-aware routes to host artifact paths", () => {
    expect(pageArtifactPath("/products/wtr/docs/", "/products/wtr/docs/")).toBe("index.html");
    expect(
      pageArtifactPath("/products/wtr/docs/packages/math--geometry/", "/products/wtr/docs"),
    ).toBe("packages/math--geometry/index.html");
    expect(
      resourceArtifactPath(
        "/products/wtr/docs/resources/basiccomponents/1234567890ab/manual.pdf",
        "/products/wtr/docs/",
      ),
    ).toBe("resources/basiccomponents/1234567890ab/manual.pdf");
    expect(() => pageArtifactPath("/docs/packages/example/", "/products/wtr/docs/")).toThrow(
      "outside BASE_PATH",
    );
  });

  test("rejects temporary, source, Git, environment, and credential paths", () => {
    expect(artifactPathIssue("packages/example/index.html")).toBeUndefined();
    expect(artifactPathIssue("resources/module/revision/manual.pdf")).toBeUndefined();
    expect(artifactPathIssue("sources/modules/example/README.md")).toContain("forbidden");
    expect(artifactPathIssue("nested/.git/config")).toContain("forbidden");
    expect(artifactPathIssue(".venv/bin/python")).toContain("forbidden");
    expect(artifactPathIssue("backup/.env.production")).toContain("environment");
    expect(artifactPathIssue("private/id_ed25519")).toContain("credential");
  });

  test("reports credential signatures without returning their values", () => {
    expect(credentialSignals("ordinary generated documentation")).toEqual([]);
    expect(credentialSignals("-----BEGIN OPENSSH PRIVATE KEY-----\nredacted")).toEqual([
      "private key",
    ]);
    expect(credentialSignals("https://user:password@example.invalid/manual")).toEqual([
      "credential-bearing URL",
    ]);
  });
});
