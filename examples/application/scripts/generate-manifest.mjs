// Build-time script. Run via `npm run generate:env`. Never imported by application code.
import { generateEnvArtifacts } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = await generateEnvArtifacts({
  fs: nodeBuildFileSystem,
  root,
  // Default discovery is ["**/env.schema.ts"] -- this example now keeps a
  // single central schema at src/env.ts instead of per-feature
  // env.schema.ts files (see database/payments env.schema.ts, both
  // commented out), so the include pattern must say so explicitly.
  include: ["src/env.ts"],
  manifest: { location: "src/generated/env.manifest.ts" },
  docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example", onExisting: "overwrite" } },
  usage: { report: { location: "docs/OWNERSHIP.md" } },
});

console.log(`Wrote manifest: ${result.manifest?.outputPath}`);
console.log(`Wrote docs: ${result.docs?.docsPath}`);
console.log(`Discovered ${result.manifest?.contracts.length ?? 0} contract(s).`);

// .env.example is regenerated and overwritten directly on every run here --
// it's a live, always-current teaching artifact, not something meant to be
// hand-merged. See the "onExisting" option (ADR-adjacent: README's CLI section).
const envExample = result.docs?.envExample;
if (envExample?.writtenPath) {
  console.log(`Wrote example: ${envExample.writtenPath}`);
}
if (envExample?.staleVariables.length) {
  console.warn(`\n${envExample.staleVariables.length} variable(s) in .env.example are no longer used:`);
  for (const name of envExample.staleVariables) {
    console.warn(` - ${name}`);
  }
}

if (result.manifest?.warnings.length) {
  console.warn(`\n${result.manifest.warnings.length} compatibility warning(s):`);
  for (const warning of result.manifest.warnings) {
    console.warn(` - ${warning.variable}: ${warning.reason}`);
  }
}

// Manifest change-tracking since the committed snapshot (env.manifest.snapshot.json)
// was last written -- see ADR 0021.
const changes = result.manifest?.changes;
if (changes) {
  const total =
    changes.addedContracts.length + changes.addedVariables.length +
    changes.updatedContracts.length + changes.updatedVariables.length +
    changes.removedContracts.length + changes.removedVariables.length;
  console.log(
    total > 0
      ? `\nManifest changes since last execution: ${changes.addedVariables.length} added, ${changes.updatedVariables.length} updated, ${changes.removedVariables.length} removed variable(s).`
      : "\nManifest changes since last execution: none.",
  );
}

// The Dependency & Ownership Report: which contracts nobody consumes, and
// which owned variables no consumer reads within this repository -- the
// mirror image of the .env.example stale-variable check above (that catches
// lingering references after a variable is removed; this catches a schema
// that was never wired up, or was abandoned mid-removal).
if (result.usage?.abandonedContracts.length) {
  console.warn(`\n${result.usage.abandonedContracts.length} abandoned contract(s) (never imported anywhere):`);
  for (const finding of result.usage.abandonedContracts) {
    console.warn(` - ${finding.contractName} (${finding.file})`);
  }
}
if (result.usage?.dependencyOwnership.length) {
  console.log(`\nDependency ownership (${result.usage.dependencyOwnership.length} contract(s)):`);
  for (const entry of result.usage.dependencyOwnership) {
    console.log(` - ${entry.contractName}: owner ${entry.owner ?? "(none)"}, blast radius ${entry.consumers.length}`);
  }
}
