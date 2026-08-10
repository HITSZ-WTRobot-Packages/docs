import type { SyncResult } from "./synchronizer";

export interface SyncReporter {
  info(message: string): void;
  warn(message: string): void;
}

export const consoleSyncReporter: SyncReporter = {
  info(message) {
    console.log(message);
  },
  warn(message) {
    console.warn(message);
  },
};

export function reportSyncResult(
  result: SyncResult,
  reporter: SyncReporter = consoleSyncReporter,
): void {
  for (const module of result.modules) {
    reporter.info(
      `${module.id}: ${module.status} (observed ${module.observedSha.slice(0, 12)}, published ${module.publishedSha.slice(0, 12)}) (${module.files} files, ${module.bytes} bytes)`,
    );
    for (const warning of module.warnings) {
      reporter.warn(`${module.id}: [${warning.code}] ${warning.message}`);
    }
  }
  reporter.info(
    `Sync summary: ${result.changed} changed, ${result.retained} retained, ${result.unchanged} unchanged, ${result.skipped} skipped${result.dryRun ? " (dry-run)" : ""}.`,
  );
}

export function formatSyncJobSummary(result: SyncResult): string {
  const rows = result.modules.map(
    (module) =>
      `| \`${module.id}\` | \`${module.status}\` | \`${module.observedSha}\` | \`${module.publishedSha}\` |`,
  );
  return [
    "## Snapshot synchronization",
    "",
    "| Module | Status | Observed SHA | Published SHA |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    `Summary: ${result.changed} changed, ${result.retained} retained, ${result.unchanged} unchanged, ${result.skipped} skipped${result.dryRun ? " (dry-run)" : ""}.`,
    "",
  ].join("\n");
}
