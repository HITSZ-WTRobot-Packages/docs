import { z } from "zod";

import { discoverModuleConfig, MODULE_ID_PATTERN } from "../../src/lib/sources/modules";

const actionBooleanSchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

const manualActionRequestSchema = z
  .object({
    mode: z.enum(["all", "changed", "module"]).default("changed"),
    module: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined)
      .pipe(z.string().regex(MODULE_ID_PATTERN).optional()),
    dry_run: actionBooleanSchema.default(true),
    commit: actionBooleanSchema.default(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === "module" && !value.module) {
      context.addIssue({ code: "custom", message: "module is required in module mode" });
    }
    if (value.mode !== "module" && value.module) {
      context.addIssue({ code: "custom", message: "module is only valid in module mode" });
    }
    if (value.dry_run && value.commit) {
      context.addIssue({ code: "custom", message: "commit cannot be enabled for a dry run" });
    }
  });

const discoveryActionRequestSchema = z
  .object({
    source_repository: z.string().trim().min(1),
    source_default_branch: z.string().trim().min(1),
  })
  .strict();

export type ActionSyncRequest = {
  mode: "all" | "changed" | "module";
  module?: string;
  dryRun: boolean;
  commit: boolean;
  discovery?: {
    repositoryFullName: string;
    branch: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveActionSyncRequest(eventName: string, payload: unknown): ActionSyncRequest {
  if (!isRecord(payload)) throw new Error("GitHub event payload must be an object.");
  if (eventName === "workflow_dispatch") {
    if (!isRecord(payload.inputs)) {
      throw new Error("GitHub workflow_dispatch event does not contain synchronization inputs.");
    }
    const parsed = manualActionRequestSchema.parse(payload.inputs);
    return {
      mode: parsed.mode,
      ...(parsed.module ? { module: parsed.module } : {}),
      dryRun: parsed.dry_run,
      commit: parsed.commit,
    };
  }

  if (eventName !== "repository_dispatch" || !isRecord(payload.client_payload)) {
    throw new Error(`GitHub event ${eventName} does not contain synchronization inputs.`);
  }

  const parsed = discoveryActionRequestSchema.parse(payload.client_payload);
  const module = discoverModuleConfig(parsed.source_repository, parsed.source_default_branch);
  return {
    mode: "module",
    module: module.id,
    dryRun: false,
    commit: true,
    discovery: {
      repositoryFullName: parsed.source_repository,
      branch: module.branch,
    },
  };
}

export function syncArguments(request: ActionSyncRequest): string[] {
  return [
    ...(request.mode === "changed" ? ["--changed"] : []),
    ...(request.discovery
      ? ["--repository", request.discovery.repositoryFullName, "--branch", request.discovery.branch]
      : request.mode === "module" && request.module
        ? ["--module", request.module]
        : []),
    ...(request.dryRun ? ["--dry-run"] : []),
  ];
}
