import { describe, expect, test } from "bun:test";

import { resolveActionSyncRequest, syncArguments } from "../../scripts/sync/action-request";

describe("GitHub synchronization request", () => {
  test("maps manual modes to the local synchronization CLI", () => {
    const request = resolveActionSyncRequest("workflow_dispatch", {
      inputs: { mode: "module", module: "sensors", dry_run: "false", commit: "true" },
    });
    expect(request).toEqual({
      mode: "module",
      module: "Sensors",
      dryRun: false,
      commit: true,
    });
    expect(syncArguments(request)).toEqual(["--module", "Sensors"]);
  });

  test("defaults repository dispatch to a changed-only dry run", () => {
    const request = resolveActionSyncRequest("repository_dispatch", { client_payload: {} });
    expect(request).toEqual({ mode: "changed", dryRun: true, commit: false });
    expect(syncArguments(request)).toEqual(["--changed", "--dry-run"]);
  });

  test("rejects ambiguous, unsafe, and unknown requests", () => {
    expect(() =>
      resolveActionSyncRequest("workflow_dispatch", {
        inputs: { mode: "all", module: "Sensors", dry_run: false, commit: false },
      }),
    ).toThrow("module is only valid");
    expect(() =>
      resolveActionSyncRequest("repository_dispatch", {
        client_payload: { mode: "module", module: "not-allowlisted" },
      }),
    ).toThrow("Unknown synchronization module");
    expect(() =>
      resolveActionSyncRequest("workflow_dispatch", {
        inputs: { mode: "changed", dry_run: true, commit: true },
      }),
    ).toThrow("commit cannot be enabled");
  });
});
