import { tmpdir } from "node:os";
import path from "node:path";

import { execa } from "execa";

import { netlifyToolchainRoot, readNetlifyBuildConfig } from "../../src/lib/deployment/netlify";
import { installDoxygen } from "../../src/lib/toolchain/doxygen-installer";
import { ToolchainDiagnostic } from "../../src/lib/toolchain/diagnostic";

const BUILD_TIMEOUT_MS = 20 * 60 * 1000;

async function main(): Promise<void> {
  try {
    const repositoryRoot = path.resolve(import.meta.dirname, "../..");
    const config = readNetlifyBuildConfig();
    const installation = await installDoxygen({
      repositoryRoot,
      installRoot: netlifyToolchainRoot(process.env, tmpdir()),
    });
    console.log(
      `Doxygen ${installation.version} ${installation.cacheHit ? "loaded from cache" : "installed and verified"}.`,
    );

    const environment = {
      ...process.env,
      PATH: `${installation.binDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
      SITE_URL: config.siteUrl,
      BASE_PATH: config.basePath,
    };
    for (const script of ["build", "check:artifacts", "check:links"] as const) {
      console.log(`Running bun run ${script} for ${config.context} at ${config.siteUrl}.`);
      await execa("bun", ["run", script], {
        cwd: repositoryRoot,
        env: environment,
        stdio: "inherit",
        timeout: BUILD_TIMEOUT_MS,
      });
    }
  } catch (error) {
    const diagnostic =
      error instanceof ToolchainDiagnostic
        ? error
        : new ToolchainDiagnostic(
            "NETLIFY_BUILD_FAILED",
            "The Netlify build or release validation failed.",
            {},
            { cause: error },
          );
    console.error(`[${diagnostic.code}] ${diagnostic.message}`);
    if (diagnostic.context.hint) console.error(`Hint: ${diagnostic.context.hint}`);
    process.exitCode = 1;
  }
}

await main();
