import { z } from "zod";

export const MODULE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/u;
export const MODULE_BRANCH_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/u;
export const MODULE_REPOSITORY_OWNER = "HITSZ-WTRobot-Packages";

function isSafeBranch(value: string): boolean {
  return (
    !value.includes("..") &&
    !value.endsWith(".") &&
    value.split("/").every((segment) => !segment.toLocaleLowerCase("en-US").endsWith(".lock"))
  );
}

export const ModuleConfigSchema = z
  .object({
    id: z.string().regex(MODULE_ID_PATTERN),
    displayName: z.string().min(1),
    repository: z.url({ protocol: /^https?$/ }),
    branch: z
      .string()
      .regex(MODULE_BRANCH_PATTERN)
      .refine(isSafeBranch, "Invalid Git branch name."),
  })
  .strict();

export type ModuleConfig = z.infer<typeof ModuleConfigSchema>;

const RepositoryFullNameSchema = z
  .string()
  .regex(
    new RegExp(`^${MODULE_REPOSITORY_OWNER}/[A-Za-z][A-Za-z0-9-]*$`, "u"),
    `Repository must belong to ${MODULE_REPOSITORY_OWNER} and use a valid module name.`,
  );

export function discoverModuleConfig(repositoryFullName: string, branch: string): ModuleConfig {
  const normalizedRepository = RepositoryFullNameSchema.parse(repositoryFullName.trim());
  const id = normalizedRepository.slice(normalizedRepository.indexOf("/") + 1);
  return ModuleConfigSchema.parse({
    id,
    displayName: id,
    repository: `https://github.com/${normalizedRepository}.git`,
    branch: branch.trim(),
  });
}

export function moduleConfigFromSnapshot(snapshot: {
  id: string;
  displayName: string;
  repository: string;
  branch: string;
}): ModuleConfig {
  return ModuleConfigSchema.parse({
    id: snapshot.id,
    displayName: snapshot.displayName,
    repository: snapshot.repository,
    branch: snapshot.branch,
  });
}

export function findModule(
  modules: readonly ModuleConfig[],
  value: string,
): ModuleConfig | undefined {
  const normalized = value.toLocaleLowerCase("en-US");
  return modules.find(
    (module) =>
      module.id.toLocaleLowerCase("en-US") === normalized ||
      module.displayName.toLocaleLowerCase("en-US") === normalized,
  );
}
