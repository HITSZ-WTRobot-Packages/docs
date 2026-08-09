import { normalizeBasePath } from "../../src/lib/paths/site-config";

const forbiddenSegments = new Set([
  ".cache",
  ".doxygen",
  ".git",
  ".sync-tmp",
  ".venv",
  "node_modules",
  "sources",
]);

const credentialPatterns = [
  {
    label: "private key",
    pattern: /-----BEGIN (?:DSA |EC |OPENSSH |RSA )?PRIVATE KEY-----/u,
  },
  {
    label: "GitHub token",
    pattern: /(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,})/u,
  },
  {
    label: "AWS access key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
  },
  {
    label: "credential-bearing URL",
    pattern: /https?:\/\/[^\s/:@]+:[^\s/@]+@/u,
  },
] as const;

function relativeRoutePath(route: string, basePath: string): string {
  const normalizedBase = normalizeBasePath(basePath);
  const url = new URL(route, "https://deployment-artifact.invalid");
  if (url.origin !== "https://deployment-artifact.invalid" || url.search || url.hash) {
    throw new Error(`Deployment route must be a local path without query or fragment: ${route}`);
  }
  if (!url.pathname.startsWith(normalizedBase)) {
    throw new Error(`Deployment route is outside BASE_PATH ${normalizedBase}: ${route}`);
  }
  return url.pathname.slice(normalizedBase.length).replace(/^\/+|\/+$/gu, "");
}

export function pageArtifactPath(route: string, basePath: string): string {
  const relativePath = relativeRoutePath(route, basePath);
  return relativePath ? `${relativePath}/index.html` : "index.html";
}

export function resourceArtifactPath(route: string, basePath: string): string {
  const relativePath = relativeRoutePath(route, basePath);
  if (!relativePath) throw new Error(`Resource route cannot resolve to the site root: ${route}`);
  return relativePath;
}

export function artifactPathIssue(relativePath: string): string | undefined {
  const normalized = relativePath.replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean);
  for (const segment of segments) {
    const lower = segment.toLowerCase();
    if (forbiddenSegments.has(lower)) return `forbidden path segment ${JSON.stringify(segment)}`;
    if (lower === ".env" || lower.startsWith(".env.")) {
      return `environment file ${JSON.stringify(segment)}`;
    }
    if (
      lower === ".netrc" ||
      lower === ".npmrc" ||
      lower === "credentials" ||
      lower === "credentials.json" ||
      lower === "id_ed25519" ||
      lower === "id_rsa"
    ) {
      return `credential file ${JSON.stringify(segment)}`;
    }
  }
  return undefined;
}

export function credentialSignals(contents: string): string[] {
  return credentialPatterns
    .filter(({ pattern }) => pattern.test(contents))
    .map(({ label }) => label);
}
