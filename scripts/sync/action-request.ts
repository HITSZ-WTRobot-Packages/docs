import { z } from "zod";

import { findModule, MODULES } from "../../src/lib/sources/modules";

const actionBooleanSchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

const actionRequestSchema = z
  .object({
    mode: z.enum(["all", "changed", "module"]).default("changed"),
    module: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined),
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

export type ActionSyncRequest = {
  mode: "all" | "changed" | "module";
  module?: string;
  dryRun: boolean;
  commit: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveActionSyncRequest(eventName: string, payload: unknown): ActionSyncRequest {
  if (!isRecord(payload)) throw new Error("GitHub event payload must be an object.");
  const source =
    eventName === "workflow_dispatch"
      ? payload.inputs
      : eventName === "repository_dispatch"
        ? payload.client_payload
        : undefined;
  if (!isRecord(source)) {
    throw new Error(`GitHub event ${eventName} does not contain synchronization inputs.`);
  }

  const parsed = actionRequestSchema.parse(source);
  const module = parsed.module ? findModule(MODULES, parsed.module) : undefined;
  if (parsed.module && !module) {
    throw new Error(`Unknown synchronization module: ${parsed.module}`);
  }
  return {
    mode: parsed.mode,
    ...(module ? { module: module.id } : {}),
    dryRun: parsed.dry_run,
    commit: parsed.commit,
  };
}

export function syncArguments(request: ActionSyncRequest): string[] {
  return [
    ...(request.mode === "changed" ? ["--changed"] : []),
    ...(request.mode === "module" && request.module ? ["--module", request.module] : []),
    ...(request.dryRun ? ["--dry-run"] : []),
  ];
}
