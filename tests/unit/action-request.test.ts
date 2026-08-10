import { describe, expect, test } from "bun:test";

import { resolveActionSyncRequest, syncArguments } from "../../scripts/sync/action-request";

describe("GitHub synchronization request", () => {
  test("maps manual modes to the local synchronization CLI", () => {
    const request = resolveActionSyncRequest("workflow_dispatch", {
      inputs: { mode: "module", module: "sensors", dry_run: "false", commit: "true" },
    });
    expect(request).toEqual({
      mode: "module",
      module: "sensors",
      dryRun: false,
      commit: true,
    });
    expect(syncArguments(request)).toEqual(["--module", "sensors"]);

    expect(
      resolveActionSyncRequest("workflow_dispatch", {
        inputs: { mode: "changed", module: "", dry_run: "true", commit: "false" },
      }),
    ).toEqual({ mode: "changed", dryRun: true, commit: false });
  });

  test("maps repository dispatch to one discovered module and an automatic commit", () => {
    const request = resolveActionSyncRequest("repository_dispatch", {
      client_payload: {
        source_repository: "HITSZ-WTRobot-Packages/NewDriver",
        source_default_branch: "main",
      },
    });
    expect(request).toEqual({
      mode: "module",
      module: "NewDriver",
      dryRun: false,
      commit: true,
      discovery: {
        repositoryFullName: "HITSZ-WTRobot-Packages/NewDriver",
        branch: "main",
      },
    });
    expect(syncArguments(request)).toEqual([
      "--repository",
      "HITSZ-WTRobot-Packages/NewDriver",
      "--branch",
      "main",
    ]);
  });

  test("rejects ambiguous, unsafe, and unknown requests", () => {
    expect(() =>
      resolveActionSyncRequest("workflow_dispatch", {
        inputs: { mode: "all", module: "Sensors", dry_run: false, commit: false },
      }),
    ).toThrow("module is only valid");
    expect(() =>
      resolveActionSyncRequest("repository_dispatch", {
        client_payload: {
          source_repository: "another-owner/UnknownDriver",
          source_default_branch: "main",
        },
      }),
    ).toThrow();
    expect(() =>
      resolveActionSyncRequest("repository_dispatch", {
        client_payload: {
          source_repository: "HITSZ-WTRobot-Packages/Sensors",
          source_default_branch: "main",
          commit: false,
        },
      }),
    ).toThrow();
    expect(() =>
      resolveActionSyncRequest("workflow_dispatch", {
        inputs: { mode: "changed", dry_run: true, commit: true },
      }),
    ).toThrow("commit cannot be enabled");
  });
});
