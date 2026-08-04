// Build-time script. Run via `npm run generate:env`. Never imported by application code.
//
// Static discovery/generation succeeds here regardless of what .env contains
// -- generateEnvArtifacts() never reads environment values, only schema
// shape (see ADR 0002). The failure this example demonstrates is a runtime
// validateEnv() failure (see src/startup.ts), not a build-time one.
import { generateEnvArtifacts } from "@maverickcer/env-cap/build";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = await generateEnvArtifacts({
  root,
  manifest: { location: "src/generated/env.manifest.ts" },
  docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example", onExisting: "overwrite" } },
});

console.log(`Wrote manifest: ${result.manifest?.outputPath}`);
console.log(`Wrote docs: ${result.docs?.docsPath}`);
console.log(`Discovered ${result.manifest?.contracts.length ?? 0} contract(s).`);

// .env.example is regenerated and overwritten directly on every run here --
// it's a live, always-current teaching artifact, not something meant to be
// hand-merged. See the "onExisting" option (README's CLI section).
const envExample = result.docs?.envExample;
if (envExample?.writtenPath) {
  console.log(`Wrote example: ${envExample.writtenPath}`);
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
