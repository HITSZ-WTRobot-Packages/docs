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

  test("derives a discovery module from an organization repository", () => {
    expect(
      parseSyncRequest([
        "--repository",
        "HITSZ-WTRobot-Packages/NewDriver",
        "--branch",
        "main",
        "--dry-run",
      ]),
    ).toEqual({
      mode: "module",
      module: "NewDriver",
      discovery: {
        id: "NewDriver",
        displayName: "NewDriver",
        repository: "https://github.com/HITSZ-WTRobot-Packages/NewDriver.git",
        branch: "main",
      },
      dryRun: true,
    });
  });

  test("rejects incompatible modes", () => {
    expect(() => parseSyncRequest(["--module", "Sensors", "--changed"])).toThrow(
      "mutually exclusive",
    );
    expect(() =>
      parseSyncRequest([
        "--repository",
        "HITSZ-WTRobot-Packages/Sensors",
        "--branch",
        "main",
        "--changed",
      ]),
    ).toThrow("cannot be combined");
    expect(() => parseSyncRequest(["--repository", "HITSZ-WTRobot-Packages/Sensors"])).toThrow(
      "provided together",
    );
    expect(() =>
      parseSyncRequest(["--repository", "another-owner/Sensors", "--branch", "main"]),
    ).toThrow("Invalid repository discovery arguments");
    expect(() =>
      parseSyncRequest([
        "--repository",
        "HITSZ-WTRobot-Packages/NewDriver",
        "--branch",
        "bad..branch",
      ]),
    ).toThrow("Invalid repository discovery arguments");
  });
});
