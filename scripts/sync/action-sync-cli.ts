import { appendFile, readFile } from "node:fs/promises";

import { execa } from "execa";

import { resolveActionSyncRequest, syncArguments } from "./action-request";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main(): Promise<void> {
  const eventName = requiredEnvironment("GITHUB_EVENT_NAME");
  const eventPath = requiredEnvironment("GITHUB_EVENT_PATH");
  const outputPath = requiredEnvironment("GITHUB_OUTPUT");
  const payload: unknown = JSON.parse(await readFile(eventPath, "utf8"));
  const request = resolveActionSyncRequest(eventName, payload);

  await execa("bun", ["run", "sync", ...syncArguments(request)], { stdio: "inherit" });
  await appendFile(
    outputPath,
    [
      `mode=${request.mode}`,
      `module=${request.module ?? ""}`,
      `dry_run=${request.dryRun}`,
      `commit=${request.commit}`,
      "",
    ].join("\n"),
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Action synchronization failed.");
  process.exitCode = 1;
}
