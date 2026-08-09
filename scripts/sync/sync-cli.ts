import { Command } from "commander";

import { SyncDiagnostic } from "../../src/lib/sources/diagnostic";
import type { SyncRequest } from "./synchronizer";
import { synchronize } from "./synchronizer";
import { reportSyncResult } from "./reporter";

type CliOptions = {
  module?: string;
  changed?: boolean;
  dryRun?: boolean;
};

function createSyncCommand(): Command {
  return new Command()
    .name("bun run sync")
    .description("Synchronize validated upstream documentation snapshots.")
    .option("--module <name>", "synchronize one allowlisted module")
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
  return {
    mode: options.module ? "module" : options.changed ? "changed" : "all",
    ...(options.module ? { module: options.module } : {}),
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
    reportSyncResult(await synchronize(request));
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
