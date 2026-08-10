import type { ModuleSnapshot } from "./manifest";
import { SyncDiagnostic } from "./diagnostic";

export type UpstreamView = "blob" | "tree";

function upstreamUrl(
  module: ModuleSnapshot,
  revision: string,
  view: UpstreamView,
  snapshotPath?: string,
): string {
  const repository = new URL(module.repository);
  if (!/^https?:$/u.test(repository.protocol) || repository.username || repository.password) {
    throw new SyncDiagnostic(
      "SNAPSHOT_REPOSITORY_INVALID",
      `Module repository is not a public HTTP(S) URL: ${module.id}`,
      { module: module.id },
    );
  }
  const repositoryPath = repository.pathname.replace(/\.git$/u, "").replace(/\/$/u, "");
  const encodedPath = snapshotPath
    ? `/${snapshotPath.split("/").map(encodeURIComponent).join("/")}`
    : "";
  repository.pathname = `${repositoryPath}/${view}/${revision}${encodedPath}`;
  repository.search = "";
  repository.hash = "";
  return repository.href;
}

export function pinnedUpstreamUrl(
  module: ModuleSnapshot,
  view: UpstreamView,
  snapshotPath?: string,
): string {
  return upstreamUrl(module, module.sha, view, snapshotPath);
}

export function branchUpstreamUrl(
  module: ModuleSnapshot,
  view: UpstreamView,
  snapshotPath?: string,
): string {
  return upstreamUrl(module, module.branch, view, snapshotPath);
}
