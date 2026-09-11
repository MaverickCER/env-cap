// Build-time script. Run via `npm run generate:env`. Never imported by application code.
import { generateEnvArtifacts } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = await generateEnvArtifacts({ fs: nodeBuildFileSystem,
  root,
  manifest: { location: "src/generated/env.manifest.ts" },
  docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example", onExisting: "overwrite" } },
  evidence: { location: "docs/env.evidence.json" },
});

console.log(`Wrote manifest: ${result.manifest?.outputPath}`);
console.log(`Wrote docs: ${result.docs?.docsPath}`);
console.log(`Discovered ${result.manifest?.contracts.length ?? 0} contract(s).`);

const envExample = result.docs?.envExample;
if (envExample?.writtenPath) {
  console.log(`Wrote example: ${envExample.writtenPath}`);
}

// Evidence change-tracking since the committed evidence artifact
// (docs/env.evidence.json) was last written -- see ADR 0038.
const changes = result.evidence.change.manifest;
const total =
  changes.addedContracts.length + changes.addedVariables.length +
  changes.updatedContracts.length + changes.updatedVariables.length +
  changes.removedContracts.length + changes.removedVariables.length;
console.log(
  total > 0
    ? `\nEvidence changes since last execution: ${changes.addedVariables.length} added, ${changes.updatedVariables.length} updated, ${changes.removedVariables.length} removed variable(s).`
    : "\nEvidence changes since last execution: none.",
);
