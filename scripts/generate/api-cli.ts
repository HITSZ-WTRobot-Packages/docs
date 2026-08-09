import { DoxygenDiagnostic } from "../../src/lib/doxygen/diagnostic";
import { loadApiCatalog } from "../../src/lib/doxygen/generator";

try {
  const catalog = await loadApiCatalog();
  const counts = {
    complete: catalog.references.filter((reference) => reference.status === "complete").length,
    sparse: catalog.references.filter((reference) => reference.status === "sparse").length,
    empty: catalog.references.filter((reference) => reference.status === "empty").length,
    failed: catalog.references.filter((reference) => reference.status === "failed").length,
  };
  const symbolCount = catalog.references.reduce(
    (total, reference) => total + reference.symbolCount,
    0,
  );
  console.log(
    `API: ${catalog.references.length} references, ${symbolCount} symbols ` +
      `(${counts.complete} complete, ${counts.sparse} sparse, ${counts.empty} empty, ${counts.failed} failed) with Doxygen ${catalog.doxygenVersion}.`,
  );
} catch (error) {
  if (error instanceof DoxygenDiagnostic) {
    console.error(`[${error.code}] ${error.message}`);
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Doxygen API generation failed with an unknown error.");
  }
  process.exitCode = 1;
}
