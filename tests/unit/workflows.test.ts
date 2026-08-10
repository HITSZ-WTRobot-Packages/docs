import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { parse as parseToml } from "smol-toml";
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
      steps: z.array(StepSchema),
    }),
  ),
});

const ActionSchema = z.looseObject({
  runs: z.looseObject({ steps: z.array(StepSchema) }),
});

const NetlifySchema = z.object({
  build: z.object({
    command: z.string(),
    publish: z.string(),
    environment: z.record(z.string(), z.string()),
  }),
});

const DoxygenReleaseSchema = z.object({
  version: z.string(),
  url: z.url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
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

  test("external actions are immutable and the Doxygen release is checksum-pinned", async () => {
    const validation = WorkflowSchema.parse(await readYaml(".github/workflows/validation.yml"));
    const synchronization = WorkflowSchema.parse(
      await readYaml(".github/workflows/sync-snapshots.yml"),
    );
    const toolchain = ActionSchema.parse(
      await readYaml(".github/actions/setup-docs-toolchain/action.yml"),
    );
    const uses = externalUses([
      ...allSteps(validation),
      ...allSteps(synchronization),
      ...toolchain.runs.steps,
    ]);
    expect(uses.length).toBeGreaterThan(0);
    expect(uses.every((value) => /@[0-9a-f]{40}$/u.test(value))).toBe(true);

    const doxygenStep = toolchain.runs.steps.find((step) => step.run?.includes("setup:doxygen"));
    const release = DoxygenReleaseSchema.parse(
      JSON.parse(await readFile(".doxygen-release.json", "utf8")),
    );
    expect(doxygenStep?.run).toContain("--print-bin");
    expect(release.url).toContain("github.com/doxygen/doxygen/releases/download/");
    expect(release.version).toBe((await readFile(".doxygen-version", "utf8")).trim());
  });

  test("Netlify uses the pinned Bun toolchain and the validated deployment command", async () => {
    const config = NetlifySchema.parse(parseToml(await readFile("netlify.toml", "utf8")));
    const packageJson = z
      .object({ scripts: z.record(z.string(), z.string()) })
      .parse(JSON.parse(await readFile("package.json", "utf8")));

    expect(config.build).toEqual({
      command: "bun run build:netlify",
      publish: "dist",
      environment: {
        BUN_VERSION: "1.3.14",
        BUN_FLAGS: "--frozen-lockfile",
      },
    });
    expect(packageJson.scripts["build:netlify"]).toContain("netlify-build-cli.ts");
    expect(packageJson.scripts["setup:doxygen"]).toContain("setup-doxygen-cli.ts");
    expect(JSON.stringify(config)).not.toContain("sync");
  });
});
