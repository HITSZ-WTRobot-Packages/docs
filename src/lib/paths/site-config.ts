import { z } from "zod";

export const DEFAULT_SITE_URL = "http://localhost:4321";
export const DEFAULT_BASE_PATH = "/";

const siteUrlSchema = z.url({ protocol: /^https?$/ }).transform((value) => new URL(value));

export type SiteConfig = {
  siteUrl: URL;
  basePath: string;
};

export type SiteEnvironment = {
  SITE_URL?: string | undefined;
  BASE_PATH?: string | undefined;
};

export class SiteConfigError extends Error {
  readonly code = "CONFIG_INVALID_URL";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SiteConfigError";
  }
}

export function normalizeBasePath(input: string | undefined): string {
  const value = input?.trim() || DEFAULT_BASE_PATH;
  if (
    !value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    throw new SiteConfigError(`BASE_PATH must be an absolute URL path: ${JSON.stringify(value)}`);
  }

  const segments = value.split("/").filter(Boolean);
  for (const segment of segments) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch (error) {
      throw new SiteConfigError(
        `BASE_PATH contains invalid percent encoding: ${JSON.stringify(value)}`,
        {
          cause: error,
        },
      );
    }
    if (decoded === "." || decoded === ".." || decoded.includes("/")) {
      throw new SiteConfigError(`BASE_PATH contains an unsafe segment: ${JSON.stringify(segment)}`);
    }
  }

  return segments.length === 0 ? DEFAULT_BASE_PATH : `/${segments.join("/")}/`;
}

export function readSiteConfig(
  environment: SiteEnvironment = {
    SITE_URL: process.env.SITE_URL,
    BASE_PATH: process.env.BASE_PATH,
  },
): SiteConfig {
  const rawSiteUrl = environment.SITE_URL?.trim() || DEFAULT_SITE_URL;
  const result = siteUrlSchema.safeParse(rawSiteUrl);
  if (!result.success) {
    throw new SiteConfigError(
      `SITE_URL must be an absolute HTTP(S) origin: ${JSON.stringify(rawSiteUrl)}`,
      {
        cause: result.error,
      },
    );
  }

  const siteUrl = result.data;
  if (
    siteUrl.username ||
    siteUrl.password ||
    siteUrl.search ||
    siteUrl.hash ||
    siteUrl.pathname !== "/"
  ) {
    throw new SiteConfigError(
      `SITE_URL must contain only an origin: ${JSON.stringify(rawSiteUrl)}`,
    );
  }

  return {
    siteUrl,
    basePath: normalizeBasePath(environment.BASE_PATH),
  };
}

export function sitePath(basePath: string, ...segments: readonly string[]): string {
  const normalizedBase = normalizeBasePath(basePath);
  const safeSegments = segments.flatMap((segment) =>
    segment
      .split("/")
      .filter(Boolean)
      .map((part) => encodeURIComponent(decodeURIComponent(part))),
  );
  return safeSegments.length === 0 ? normalizedBase : `${normalizedBase}${safeSegments.join("/")}/`;
}

export function siteUrl(config: SiteConfig, ...segments: readonly string[]): URL {
  return new URL(sitePath(config.basePath, ...segments), config.siteUrl);
}
