import { exists, readFile } from "node:fs/promises";
import path from "node:path";

import { glob } from "tinyglobby";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const forbiddenLockfiles = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];
const requiredPaths = [
  "AGENTS.md",
  "README.md",
  "issues.md",
  "bun.lock",
  "astro.config.ts",
  "src/lib/paths/site-config.ts",
] as const;

const errors: string[] = [];

for (const file of forbiddenLockfiles) {
  if (await exists(path.join(repositoryRoot, file))) {
    errors.push(`forbidden package-manager lockfile: ${file}`);
  }
}

for (const file of requiredPaths) {
  if (!(await exists(path.join(repositoryRoot, file)))) {
    errors.push(`required project contract is missing: ${file}`);
  }
}

const packageJson = (await Bun.file(path.join(repositoryRoot, "package.json")).json()) as unknown;
if (
  typeof packageJson !== "object" ||
  packageJson === null ||
  !("packageManager" in packageJson) ||
  packageJson.packageManager !== "bun@1.3.14"
) {
  errors.push('package.json must declare "packageManager": "bun@1.3.14"');
}

const unexpectedGitDirectories = await glob(["sources/**/.git", "dist/**/.git"], {
  cwd: repositoryRoot,
  dot: true,
  onlyDirectories: true,
});
for (const directory of unexpectedGitDirectories) {
  errors.push(`embedded Git metadata is forbidden: ${directory}`);
}

const sharedRuntimeFiles = await glob(["src/**/*.{astro,js,mjs,ts}"], {
  cwd: repositoryRoot,
  onlyFiles: true,
});
for (const file of sharedRuntimeFiles) {
  const contents = await readFile(path.join(repositoryRoot, file), "utf8");
  if (/\bBun\./u.test(contents)) {
    errors.push(`shared Astro code must not use Bun-only runtime APIs: ${file}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[CONVENTION_VIOLATION] ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log("Convention check passed.");
}
