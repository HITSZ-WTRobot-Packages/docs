import { loadPackageCatalog } from "../../src/lib/catalog/loader";

try {
  const catalog = await loadPackageCatalog();
  const internalDependencies = catalog.packages.reduce(
    (count, entry) =>
      count + entry.dependencies.filter((dependency) => dependency.kind === "internal").length,
    0,
  );
  const externalDependencies = catalog.packages.reduce(
    (count, entry) =>
      count + entry.dependencies.filter((dependency) => dependency.kind === "external").length,
    0,
  );
  console.log(
    `Catalog: ${catalog.modules.length} modules, ${catalog.packages.length} packages, ${internalDependencies} internal dependencies, ${externalDependencies} external dependencies.`,
  );
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Catalog generation failed with an unknown error.");
  }
  process.exitCode = 1;
}
