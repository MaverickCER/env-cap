// Build-time script. Run via `npm run generate:env`. Never imported by
// application code.
//
// Unlike every other example, this one calls the standalone generator
// functions -- generateEnvManifest(), generateDocumentation(),
// generateUsageReport(), generateEvidenceModel() -- separately, instead of
// one combined generateEnvArtifacts() call. See README.md for the real
// trade-off this demonstrates: four independent discovery/link passes
// instead of one shared pass (ADR 0011), and distinct error types instead
// of one aggregated EnvProjectGenerationError. `generateEnvManifest()`
// itself no longer tracks change-history (ADR 0038 moved that to the
// persisted evidence artifact) -- this script writes that artifact itself,
// by hand, exactly as `generateEnvArtifacts()`'s own `evidence` option
// would, to keep demonstrating the same four facts a combined call gives.
import {
  computeSourceFingerprint,
  generateDocumentation,
  generateEnvManifest,
  generateEvidenceModel,
  generateUsageReport,
} from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Same override every other example with a centralized src/env.ts needs --
// default discovery is ["**/env.schema.ts"], and this contract lives at
// src/env.ts instead.
const include = ["src/env.ts"];

const manifestResult = await generateEnvManifest({ fs: nodeBuildFileSystem, root, include, location: "src/generated/env.manifest.ts" });
console.log(`Wrote manifest: ${manifestResult.outputPath}`);
console.log(`Discovered ${manifestResult.contracts.length} contract(s).`);
if (manifestResult.warnings.length) {
  console.warn(`\n${manifestResult.warnings.length} compatibility warning(s):`);
  for (const warning of manifestResult.warnings) {
    const codePrefix = warning.code ? `[${warning.code}] ` : "";
    console.warn(` - ${codePrefix}${warning.variable}: ${warning.reason}`);
  }
}

// Matches generateEnvManifest()/generateEnvArtifacts()'s own DEFAULT_EXCLUDE
// -- not itself re-exported (Private tier), so named explicitly here.
const exclude = ["**/node_modules/**", "**/dist/**", "**/.git/**"];

const evidencePath = path.resolve(root, "docs/env.evidence.json");
const evidence = await generateEvidenceModel({ fs: nodeBuildFileSystem, root, include, previousSnapshotLocation: "docs/env.evidence.json" });
await fs.mkdir(path.dirname(evidencePath), { recursive: true });
await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
await fs.writeFile(
  `${evidencePath}.fingerprint`,
  `${await computeSourceFingerprint({ fs: nodeBuildFileSystem, root, include, exclude, packages: [] })}\n`,
  "utf8",
);
console.log(`Wrote evidence: ${evidencePath}`);

const changes = evidence.change.manifest;
const totalChanges =
  changes.addedContracts.length + changes.addedVariables.length +
  changes.updatedContracts.length + changes.updatedVariables.length +
  changes.removedContracts.length + changes.removedVariables.length;
console.log(
  totalChanges > 0
    ? `\nEvidence changes since last execution: ${changes.addedVariables.length} added, ${changes.updatedVariables.length} updated, ${changes.removedVariables.length} removed variable(s).`
    : "\nEvidence changes since last execution: none.",
);

const docsResult = await generateDocumentation({ fs: nodeBuildFileSystem,
  root,
  include,
  location: "docs/ENVIRONMENT.md",
  envExample: { location: ".env.example", onExisting: "overwrite" },
});
console.log(`\nWrote docs: ${docsResult.docsPath}`);
if (docsResult.envExample?.writtenPath) {
  console.log(`Wrote example: ${docsResult.envExample.writtenPath}`);
}

const usageResult = await generateUsageReport({ fs: nodeBuildFileSystem, root, include, report: { location: "docs/OWNERSHIP.md" } });
console.log(`\nWrote dependency ownership report: ${usageResult.reportPath}`);
console.log(`Dependency ownership (${usageResult.dependencyOwnership.length} contract(s)):`);
for (const entry of usageResult.dependencyOwnership) {
  console.log(` - ${entry.contractName}: owner ${entry.owner ?? "(none)"}, blast radius ${entry.consumers.length}`);
}
