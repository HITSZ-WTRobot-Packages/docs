import { Command } from "commander";
import { appendFile } from "node:fs/promises";

import { SyncDiagnostic } from "../../src/lib/sources/diagnostic";
import { discoverModuleConfig, type ModuleConfig } from "../../src/lib/sources/modules";
import type { SyncRequest } from "./synchronizer";
import { synchronize } from "./synchronizer";
import { formatSyncJobSummary, reportSyncResult } from "./reporter";

type CliOptions = {
  module?: string;
  changed?: boolean;
  dryRun?: boolean;
  repository?: string;
  branch?: string;
};

function createSyncCommand(): Command {
  return new Command()
    .name("bun run sync")
    .description("Synchronize validated upstream documentation snapshots.")
    .option("--module <name>", "synchronize one indexed module")
    .option(
      "--repository <owner/name>",
      "discover and synchronize one HITSZ-WTRobot-Packages repository",
    )
    .option("--branch <name>", "default branch for --repository")
    .option("--changed", "synchronize modules whose remote SHA differs from the manifest")
    .option("--dry-run", "compute and validate changes without writing repository files")
    .allowExcessArguments(false);
}

export function parseSyncRequest(arguments_: readonly string[]): SyncRequest {
  const command = createSyncCommand().exitOverride();

  let options: CliOptions;
  try {
    command.parse([...arguments_], { from: "user" });
    options = command.opts<CliOptions>();
  } catch (error) {
    throw new SyncDiagnostic(
      "CLI_INVALID_ARGUMENT",
      "Invalid synchronization arguments.",
      {},
      { cause: error },
    );
  }

  if (options.module && options.changed) {
    throw new SyncDiagnostic(
      "CLI_INVALID_ARGUMENT",
      "--module and --changed are mutually exclusive.",
    );
  }
  if (options.repository && (options.module || options.changed)) {
    throw new SyncDiagnostic(
      "CLI_INVALID_ARGUMENT",
      "--repository cannot be combined with --module or --changed.",
    );
  }
  if (Boolean(options.repository) !== Boolean(options.branch)) {
    throw new SyncDiagnostic(
      "CLI_INVALID_ARGUMENT",
      "--repository and --branch must be provided together.",
    );
  }
  let discovery: ModuleConfig | undefined;
  try {
    discovery =
      options.repository && options.branch
        ? discoverModuleConfig(options.repository, options.branch)
        : undefined;
  } catch (error) {
    throw new SyncDiagnostic(
      "CLI_INVALID_ARGUMENT",
      "Invalid repository discovery arguments.",
      {},
      { cause: error },
    );
  }
  return {
    mode: options.module || discovery ? "module" : options.changed ? "changed" : "all",
    ...(options.module ? { module: options.module } : {}),
    ...(discovery ? { module: discovery.id, discovery } : {}),
    dryRun: options.dryRun ?? false,
  };
}

async function main(): Promise<void> {
  try {
    const arguments_ = process.argv.slice(2);
    if (arguments_.includes("--help") || arguments_.includes("-h")) {
      console.log(createSyncCommand().helpInformation());
      return;
    }
    const request = parseSyncRequest(arguments_);
    const result = await synchronize(request);
    reportSyncResult(result);
    const jobSummaryPath = process.env.GITHUB_STEP_SUMMARY?.trim();
    if (jobSummaryPath) await appendFile(jobSummaryPath, formatSyncJobSummary(result), "utf8");
  } catch (error) {
    const diagnostic =
      error instanceof SyncDiagnostic
        ? error
        : new SyncDiagnostic("SYNC_FAILED", "Source synchronization failed.", {}, { cause: error });
    console.error(`[${diagnostic.code}] ${diagnostic.message}`);
    if (diagnostic.context.module) {
      console.error(`Module: ${diagnostic.context.module}`);
    }
    if (diagnostic.context.path) {
      console.error(`Path: ${diagnostic.context.path}`);
    }
    if (diagnostic.context.hint) {
      console.error(`Hint: ${diagnostic.context.hint}`);
    }
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}
