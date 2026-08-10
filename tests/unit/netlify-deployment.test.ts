import { describe, expect, test } from "bun:test";

import { netlifyToolchainRoot, readNetlifyBuildConfig } from "../../src/lib/deployment/netlify";
import { ToolchainDiagnostic } from "../../src/lib/toolchain/diagnostic";

describe("Netlify deployment configuration", () => {
  test("uses the primary site URL for production", () => {
    expect(
      readNetlifyBuildConfig({
        NETLIFY: "true",
        CONTEXT: "production",
        URL: "https://wtr-packages.netlify.app",
        DEPLOY_PRIME_URL: "https://deploy-id--wtr-packages.netlify.app",
      }),
    ).toEqual({
      context: "production",
      siteUrl: "https://wtr-packages.netlify.app",
      basePath: "/",
    });
  });

  test.each(["deploy-preview", "branch-deploy", "preview-server", "dev"] as const)(
    "uses the deploy URL for %s",
    (context) => {
      expect(
        readNetlifyBuildConfig({
          NETLIFY: "true",
          CONTEXT: context,
          URL: "https://wtr-packages.netlify.app",
          DEPLOY_PRIME_URL: "https://deploy-id--wtr-packages.netlify.app",
        }),
      ).toEqual({
        context,
        siteUrl: "https://deploy-id--wtr-packages.netlify.app",
        basePath: "/",
      });
    },
  );

  test("rejects a missing deploy URL", () => {
    expect(() => readNetlifyBuildConfig({ NETLIFY: "true", CONTEXT: "deploy-preview" })).toThrow(
      ToolchainDiagnostic,
    );
  });

  test.each([
    "not-a-url",
    "ftp://wtr-packages.netlify.app",
    "https://wtr-packages.netlify.app/docs/",
  ])("rejects invalid deployment URL %s", (url) => {
    try {
      readNetlifyBuildConfig({ NETLIFY: "true", CONTEXT: "production", URL: url });
      throw new Error("Expected invalid Netlify URL to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ToolchainDiagnostic);
      if (!(error instanceof ToolchainDiagnostic)) throw error;
      expect(error.code).toBe("NETLIFY_URL_INVALID");
    }
  });

  test("uses the Netlify cache and falls back to the temporary directory", () => {
    expect(netlifyToolchainRoot({ NETLIFY_CACHE_DIR: "/opt/netlify/cache" }, "/tmp/fallback")).toBe(
      "/opt/netlify/cache/wtr-docs-toolchain",
    );
    expect(netlifyToolchainRoot({}, "/tmp/fallback")).toBe("/tmp/fallback/wtr-docs-toolchain");
  });
});
