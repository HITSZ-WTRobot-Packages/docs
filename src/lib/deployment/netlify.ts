import path from "node:path";

import { z } from "zod";

import { readSiteConfig } from "../paths/site-config";
import { ToolchainDiagnostic } from "../toolchain/diagnostic";

const NetlifyEnvironmentSchema = z.object({
  NETLIFY: z.literal("true"),
  CONTEXT: z.enum(["production", "deploy-preview", "branch-deploy", "preview-server", "dev"]),
  URL: z.string().optional(),
  DEPLOY_PRIME_URL: z.string().optional(),
  NETLIFY_CACHE_DIR: z.string().optional(),
});

export type NetlifyBuildConfig = {
  context: z.infer<typeof NetlifyEnvironmentSchema>["CONTEXT"];
  siteUrl: string;
  basePath: "/";
};

export function readNetlifyBuildConfig(
  environment: Record<string, string | undefined> = process.env,
): NetlifyBuildConfig {
  const result = NetlifyEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new ToolchainDiagnostic(
      "NETLIFY_ENVIRONMENT_INVALID",
      "The Netlify build environment is missing required deployment metadata.",
      { hint: "Run this command through a Netlify production or preview build." },
      { cause: result.error },
    );
  }

  const candidate =
    result.data.CONTEXT === "production" ? result.data.URL : result.data.DEPLOY_PRIME_URL;
  if (!candidate?.trim()) {
    throw new ToolchainDiagnostic(
      "NETLIFY_URL_MISSING",
      result.data.CONTEXT === "production"
        ? "Netlify did not provide URL for the production deploy."
        : "Netlify did not provide DEPLOY_PRIME_URL for the preview deploy.",
    );
  }

  try {
    const config = readSiteConfig({ SITE_URL: candidate, BASE_PATH: "/" });
    return {
      context: result.data.CONTEXT,
      siteUrl: config.siteUrl.origin,
      basePath: "/",
    };
  } catch (error) {
    throw new ToolchainDiagnostic(
      "NETLIFY_URL_INVALID",
      "The Netlify deployment URL must be an absolute HTTP(S) origin without a path.",
      {},
      { cause: error },
    );
  }
}

export function netlifyToolchainRoot(
  environment: Record<string, string | undefined> = process.env,
  temporaryDirectory: string,
): string {
  const cacheRoot = environment.NETLIFY_CACHE_DIR?.trim();
  return path.resolve(cacheRoot || temporaryDirectory, "wtr-docs-toolchain");
}
