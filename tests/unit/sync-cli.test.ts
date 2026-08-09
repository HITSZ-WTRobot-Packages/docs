import { describe, expect, test } from "bun:test";

import { parseSyncRequest } from "../../scripts/sync/sync-cli";

describe("synchronization CLI", () => {
  test("defaults to a full write", () => {
    expect(parseSyncRequest([])).toEqual({ mode: "all", dryRun: false });
  });

  test("parses module, changed, and dry-run modes", () => {
    expect(parseSyncRequest(["--module", "Sensors", "--dry-run"])).toEqual({
      mode: "module",
      module: "Sensors",
      dryRun: true,
    });
    expect(parseSyncRequest(["--changed"])).toEqual({ mode: "changed", dryRun: false });
  });

  test("rejects incompatible modes", () => {
    expect(() => parseSyncRequest(["--module", "Sensors", "--changed"])).toThrow(
      "mutually exclusive",
    );
  });
});
