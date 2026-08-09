import { rm } from "node:fs/promises";

import { simpleGit } from "simple-git";

import { SyncDiagnostic } from "../../src/lib/sources/diagnostic";
import type { ModuleConfig } from "../../src/lib/sources/modules";

export interface GitClient {
  resolveRevision(module: ModuleConfig): Promise<string>;
  clone(module: ModuleConfig, destination: string): Promise<string>;
}

const GIT_ATTEMPTS = 3;
const GIT_IDLE_TIMEOUT_MS = 90_000;
const GIT_RETRY_DELAY_MS = 750;

type RetryOptions = {
  attempts: number;
  delayMs: number;
};

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function retryGitOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SyncDiagnostic) {
        throw error;
      }
      lastError = error;
      if (attempt < options.attempts && options.delayMs > 0) {
        await delay(options.delayMs);
      }
    }
  }
  throw lastError;
}

function git(baseDir?: string) {
  const options = {
    config: ["http.version=HTTP/1.1", "http.sslVersion=tlsv1.2"],
    timeout: { block: GIT_IDLE_TIMEOUT_MS },
  };
  return baseDir ? simpleGit(baseDir, options) : simpleGit(options);
}

function validateSha(value: string, module: ModuleConfig): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(normalized)) {
    throw new SyncDiagnostic(
      "SYNC_GIT_INVALID_REVISION",
      `Git returned an invalid revision for ${module.id}.`,
      {
        module: module.id,
      },
    );
  }
  return normalized;
}

export class SimpleGitClient implements GitClient {
  async resolveRevision(module: ModuleConfig): Promise<string> {
    try {
      return await retryGitOperation(
        async () => {
          const output = await git().listRemote(["--heads", module.repository, module.branch]);
          const firstField = output.trim().split(/\s+/u, 1)[0];
          return validateSha(firstField ?? "", module);
        },
        { attempts: GIT_ATTEMPTS, delayMs: GIT_RETRY_DELAY_MS },
      );
    } catch (error) {
      if (error instanceof SyncDiagnostic) {
        throw error;
      }
      throw new SyncDiagnostic(
        "SYNC_GIT_FAILED",
        `Unable to resolve ${module.id} branch ${module.branch}.`,
        {
          module: module.id,
          hint: "Verify repository availability, branch configuration, and credentials.",
        },
        { cause: error },
      );
    }
  }

  async clone(module: ModuleConfig, destination: string): Promise<string> {
    try {
      return await retryGitOperation(
        async () => {
          await rm(destination, { recursive: true, force: true });
          await git().clone(module.repository, destination, [
            "--depth",
            "1",
            "--branch",
            module.branch,
            "--single-branch",
            "--no-tags",
          ]);
          return validateSha(await git(destination).revparse(["HEAD"]), module);
        },
        { attempts: GIT_ATTEMPTS, delayMs: GIT_RETRY_DELAY_MS },
      );
    } catch (error) {
      if (error instanceof SyncDiagnostic) {
        throw error;
      }
      throw new SyncDiagnostic(
        "SYNC_GIT_FAILED",
        `Unable to clone ${module.id} branch ${module.branch}.`,
        { module: module.id, hint: "The previous committed snapshot has not been changed." },
        { cause: error },
      );
    }
  }
}
