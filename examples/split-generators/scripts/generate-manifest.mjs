// Build-time script. Run via `npm run generate:env`. Never imported by
// application code.
//
// Unlike every other example, this one calls the three standalone
// generator functions -- generateEnvManifest(), generateDocumentation(),
// generateUsageReport() -- separately, instead of one combined
// generateEnvArtifacts() call. See README.md for the real trade-off this
// demonstrates: three independent discovery/link passes instead of one
// shared pass (ADR 0011), and three distinct error types instead of one
// aggregated EnvProjectGenerationError.
import { generateDocumentation, generateEnvManifest, generateUsageReport } from "@maverickcer/env-cap/build";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Same override every other example with a centralized src/env.ts needs --
// default discovery is ["**/env.schema.ts"], and this contract lives at
// src/env.ts instead.
const include = ["src/env.ts"];

const manifestResult = await generateEnvManifest({ root, include, location: "src/generated/env.manifest.ts" });
console.log(`Wrote manifest: ${manifestResult.outputPath}`);
console.log(`Discovered ${manifestResult.contracts.length} contract(s).`);
if (manifestResult.warnings.length) {
  console.warn(`\n${manifestResult.warnings.length} compatibility warning(s):`);
  for (const warning of manifestResult.warnings) {
    const codePrefix = warning.code ? `[${warning.code}] ` : "";
    console.warn(` - ${codePrefix}${warning.variable}: ${warning.reason}`);
  }
}
const changes = manifestResult.changes;
const totalChanges =
  changes.addedContracts.length + changes.addedVariables.length +
  changes.updatedContracts.length + changes.updatedVariables.length +
  changes.removedContracts.length + changes.removedVariables.length;
console.log(
  totalChanges > 0
    ? `\nManifest changes since last execution: ${changes.addedVariables.length} added, ${changes.updatedVariables.length} updated, ${changes.removedVariables.length} removed variable(s).`
    : "\nManifest changes since last execution: none.",
);

const docsResult = await generateDocumentation({
  root,
  include,
  location: "docs/ENVIRONMENT.md",
  envExample: { location: ".env.example", onExisting: "overwrite" },
});
console.log(`\nWrote docs: ${docsResult.docsPath}`);
if (docsResult.envExample?.writtenPath) {
  console.log(`Wrote example: ${docsResult.envExample.writtenPath}`);
}

const usageResult = await generateUsageReport({ root, include, report: { location: "docs/OWNERSHIP.md" } });
console.log(`\nWrote dependency ownership report: ${usageResult.reportPath}`);
console.log(`Dependency ownership (${usageResult.dependencyOwnership.length} contract(s)):`);
for (const entry of usageResult.dependencyOwnership) {
  console.log(` - ${entry.contractName}: owner ${entry.owner ?? "(none)"}, blast radius ${entry.consumers.length}`);
}
