import { simpleGit } from "simple-git";

import { SyncDiagnostic } from "../../src/lib/sources/diagnostic";
import type { ModuleConfig } from "../../src/lib/sources/modules";

export interface GitClient {
  resolveRevision(module: ModuleConfig): Promise<string>;
  clone(module: ModuleConfig, destination: string): Promise<string>;
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
      const output = await simpleGit().listRemote(["--heads", module.repository, module.branch]);
      const firstField = output.trim().split(/\s+/u, 1)[0];
      return validateSha(firstField ?? "", module);
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
      await simpleGit().clone(module.repository, destination, [
        "--depth",
        "1",
        "--branch",
        module.branch,
        "--single-branch",
        "--no-tags",
      ]);
      return validateSha(await simpleGit(destination).revparse(["HEAD"]), module);
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
