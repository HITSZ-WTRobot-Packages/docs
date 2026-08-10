import path from "node:path";

import { Command } from "commander";

import { installDoxygen } from "../../src/lib/toolchain/doxygen-installer";
import { ToolchainDiagnostic } from "../../src/lib/toolchain/diagnostic";

type CliOptions = {
  installRoot: string;
  printBin?: boolean;
};

function createCommand(): Command {
  return new Command()
    .name("bun run setup:doxygen")
    .description("Install the repository-pinned Doxygen release with checksum verification.")
    .option("--install-root <path>", "toolchain installation root", ".cache/toolchains")
    .option("--print-bin", "print only the installed binary directory")
    .allowExcessArguments(false);
}

async function main(): Promise<void> {
  try {
    const command = createCommand().parse(process.argv);
    const options = command.opts<CliOptions>();
    const repositoryRoot = path.resolve(import.meta.dirname, "../..");
    const result = await installDoxygen({
      repositoryRoot,
      installRoot: path.resolve(repositoryRoot, options.installRoot),
    });

    if (options.printBin) {
      console.log(result.binDirectory);
      return;
    }
    console.log(
      `Doxygen ${result.version} ${result.cacheHit ? "found in cache" : "installed and verified"} at ${result.binDirectory}.`,
    );
  } catch (error) {
    const diagnostic =
      error instanceof ToolchainDiagnostic
        ? error
        : new ToolchainDiagnostic(
            "DOXYGEN_SETUP_FAILED",
            "Doxygen toolchain setup failed.",
            {},
            { cause: error },
          );
    console.error(`[${diagnostic.code}] ${diagnostic.message}`);
    if (diagnostic.context.path) console.error(`Path: ${diagnostic.context.path}`);
    if (diagnostic.context.hint) console.error(`Hint: ${diagnostic.context.hint}`);
    process.exitCode = 1;
  }
}

await main();
