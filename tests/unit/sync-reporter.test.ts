import { describe, expect, test } from "bun:test";

import { formatSyncJobSummary, reportSyncResult } from "../../scripts/sync/reporter";
import type { SyncResult } from "../../scripts/sync/synchronizer";

const observedSha = "a".repeat(40);
const publishedSha = "b".repeat(40);

function retainedResult(): SyncResult {
  return {
    mode: "changed",
    dryRun: false,
    modules: [
      {
        id: "FixtureModule",
        status: "retained",
        observedSha,
        publishedSha,
        files: 3,
        bytes: 128,
        warnings: [],
      },
    ],
    changed: 0,
    retained: 1,
    unchanged: 0,
    skipped: 0,
  };
}

describe("synchronization reporting", () => {
  test("reports observed and published revisions for retained modules", () => {
    const info: string[] = [];
    reportSyncResult(retainedResult(), {
      info(message) {
        info.push(message);
      },
      warn() {},
    });

    expect(info).toEqual([
      "FixtureModule: retained (observed aaaaaaaaaaaa, published bbbbbbbbbbbb) (3 files, 128 bytes)",
      "Sync summary: 0 changed, 1 retained, 0 unchanged, 0 skipped.",
    ]);
  });

  test("formats the complete revisions for the Actions job summary", () => {
    const summary = formatSyncJobSummary(retainedResult());
    expect(summary).toContain("| Module | Status | Observed SHA | Published SHA |");
    expect(summary).toContain(
      `| \`FixtureModule\` | \`retained\` | \`${observedSha}\` | \`${publishedSha}\` |`,
    );
    expect(summary).toContain("Summary: 0 changed, 1 retained, 0 unchanged, 0 skipped.");
  });
});
