import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { parse } from "yaml";
import { z } from "zod";

const StepSchema = z.looseObject({
  uses: z.string().optional(),
  run: z.string().optional(),
  env: z.record(z.string(), z.unknown()).optional(),
  with: z.record(z.string(), z.unknown()).optional(),
});

const WorkflowSchema = z.looseObject({
  name: z.string(),
  on: z.record(z.string(), z.unknown()),
  permissions: z.record(z.string(), z.string()),
  concurrency: z.looseObject({ group: z.string(), "cancel-in-progress": z.boolean() }),
  jobs: z.record(
    z.string(),
    z.looseObject({
      if: z.string().optional(),
      steps: z.array(StepSchema),
    }),
  ),
});

const ActionSchema = z.looseObject({
  runs: z.looseObject({ steps: z.array(StepSchema) }),
});

async function readYaml(path: string): Promise<unknown> {
  return parse(await readFile(path, "utf8"));
}

function allSteps(workflow: z.infer<typeof WorkflowSchema>): z.infer<typeof StepSchema>[] {
  return Object.values(workflow.jobs).flatMap((job) => job.steps);
}

function externalUses(steps: z.infer<typeof StepSchema>[]): string[] {
  return steps.flatMap((step) => (step.uses && !step.uses.startsWith("./") ? [step.uses] : []));
}

describe("GitHub Actions contracts", () => {
  test("validation is manual-only, snapshot-only, read-only, and covers all site variants", async () => {
    const workflow = WorkflowSchema.parse(await readYaml(".github/workflows/validation.yml"));
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency["cancel-in-progress"]).toBe(true);
    const serialized = JSON.stringify(workflow);
    expect(serialized).not.toContain("bun run sync");
    expect(serialized).not.toMatch(/pages|deploy/i);
    expect(serialized).toContain("/docs/");
    expect(serialized).toContain("/products/wtr/docs/");
    const browserSteps = allSteps(workflow).filter((step) => step.run === "bun run test:e2e");
    expect(browserSteps).toHaveLength(1);
    expect(browserSteps[0]?.env?.PLAYWRIGHT_REUSE_ARTIFACT).toBe("1");
    for (const step of allSteps(workflow).filter((entry) => entry.uses?.includes("checkout"))) {
      expect(step.with?.["persist-credentials"]).toBe(false);
    }
  });

  test("snapshot synchronization is explicit, serialized, and write-scoped", async () => {
    const workflow = WorkflowSchema.parse(await readYaml(".github/workflows/sync-snapshots.yml"));
    expect(Object.keys(workflow.on).sort()).toEqual(["repository_dispatch", "workflow_dispatch"]);
    expect(workflow.permissions).toEqual({ contents: "write" });
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
    const serialized = JSON.stringify(workflow);
    expect(serialized).toContain("bun run sync:action");
    expect(serialized).toContain("git status --porcelain --untracked-files=all -- sources/");
    expect(serialized).toContain("git add -- sources/");
    expect(serialized).toContain("git diff --cached --quiet && exit 0");
    expect(serialized).toContain("steps.request.outputs.commit == 'true'");
    const browserStep = allSteps(workflow).find((step) => step.run === "bun run test:e2e");
    expect(browserStep?.env?.PLAYWRIGHT_REUSE_ARTIFACT).toBe("1");
    expect(serialized).not.toMatch(/pages|deploy/i);
    for (const step of allSteps(workflow)) {
      expect(step.run ?? "").not.toContain("${{ github.event.client_payload");
      expect(step.run ?? "").not.toContain("${{ inputs.");
    }
  });

  test("repository callers use a read-only reusable discovery workflow", async () => {
    const workflow = WorkflowSchema.parse(
      await readYaml(".github/workflows/request-docs-sync.yml"),
    );
    expect(Object.keys(workflow.on)).toEqual(["workflow_call"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
    expect(workflow.jobs.dispatch?.if).toBe(
      "${{ github.ref_name == github.event.repository.default_branch }}",
    );

    const serialized = JSON.stringify(workflow);
    expect(serialized).toContain("DOCS_SYNC_TOKEN");
    expect(serialized).toContain("repos/HITSZ-WTRobot-Packages/docs/dispatches");
    expect(serialized).toContain("client_payload[source_repository]");
    expect(serialized).toContain("client_payload[source_default_branch]");
    expect(serialized).toContain("sync-snapshots");
    expect(serialized).not.toContain("actions/checkout");
    expect(serialized).not.toContain("bun run sync");

    for (const step of allSteps(workflow)) {
      expect(step.run ?? "").not.toContain("${{ github.repository }}");
      expect(step.run ?? "").not.toContain("${{ github.event.repository.default_branch }}");
      expect(step.run ?? "").not.toContain("${{ secrets.DOCS_SYNC_TOKEN }}");
    }
  });

  test("external actions are immutable and Doxygen is synchronization-only", async () => {
    const validation = WorkflowSchema.parse(await readYaml(".github/workflows/validation.yml"));
    const synchronization = WorkflowSchema.parse(
      await readYaml(".github/workflows/sync-snapshots.yml"),
    );
    const request = WorkflowSchema.parse(await readYaml(".github/workflows/request-docs-sync.yml"));
    const toolchain = ActionSchema.parse(
      await readYaml(".github/actions/setup-docs-toolchain/action.yml"),
    );
    const uses = externalUses([
      ...allSteps(validation),
      ...allSteps(synchronization),
      ...allSteps(request),
      ...toolchain.runs.steps,
    ]);
    expect(uses.length).toBeGreaterThan(0);
    expect(uses.every((value) => /@[0-9a-f]{40}$/u.test(value))).toBe(true);

    const synchronizationDoxygen = allSteps(synchronization).filter((step) =>
      step.uses?.startsWith("ssciwr/doxygen-install@"),
    );
    expect(synchronizationDoxygen).toHaveLength(1);
    expect(synchronizationDoxygen[0]?.with?.version).toBe(
      "${{ steps.doxygen-version.outputs.version }}",
    );
    expect(JSON.stringify(synchronization)).toContain(".doxygen-version");
    expect(JSON.stringify(validation)).not.toContain("doxygen-install");
    expect(JSON.stringify(toolchain)).not.toContain("doxygen");
    expect((await readFile(".doxygen-version", "utf8")).trim()).toBe("1.16.1");
  });
});
