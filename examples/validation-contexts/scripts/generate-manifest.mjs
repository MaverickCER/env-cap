// Build-time script. Run via `npm run generate:env`. Never imported by application code.
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

const envExample = result.docs?.envExample;
if (envExample?.writtenPath) {
  console.log(`Wrote example: ${envExample.writtenPath}`);
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
