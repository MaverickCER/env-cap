// Build-time script. Run via `npm run generate:env`. Never imported by application code.
import { generateEnvArtifacts } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// No `tsconfig` option passed -- this example's own root/tsconfig.json (its
// "@/*" path alias) is auto-detected automatically (ADR 0023). See README.md.
const result = await generateEnvArtifacts({ fs: nodeBuildFileSystem,
  root,
  manifest: { location: "src/generated/env.manifest.ts" },
  docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example", onExisting: "overwrite" } },
  usage: { report: { location: "docs/OWNERSHIP.md" } },
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

// The actual point of this example: the payments contract is imported only
// through the "@/*" alias (src/server.ts) -- without ADR 0023's alias
// resolution, this section would list it as abandoned even though it's
// plainly consumed. See docs/OWNERSHIP.md and README.md.
if (result.usage?.abandonedContracts.length) {
  console.warn(`\n${result.usage.abandonedContracts.length} abandoned contract(s) (never imported anywhere):`);
  for (const finding of result.usage.abandonedContracts) {
    console.warn(` - ${finding.contractName} (${finding.file})`);
  }
} else {
  console.log("\nNo abandoned contracts -- the alias-only import was resolved correctly.");
}
if (result.usage?.dependencyOwnership.length) {
  console.log(`\nDependency ownership (${result.usage.dependencyOwnership.length} contract(s)):`);
  for (const entry of result.usage.dependencyOwnership) {
    console.log(` - ${entry.contractName}: owner ${entry.owner ?? "(none)"}, blast radius ${entry.consumers.length}`);
  }
}
