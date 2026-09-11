// Build-time script. Run via `npm run generate:env`. Never imported by application code.
//
// ADVANCED TIER -- deliberately NOT the pattern to copy by default.
//
// The `application` and `team-service` examples both call the `env-cap` CLI
// straight from a `docs`/`check` npm script, with no script file at all;
// that is the pattern to start from, and what almost every project wants.
// This example keeps a hand-written script only because it does genuine
// custom reporting the CLI does not and should not do: per-contract
// blast-radius lines and stale-`.env.example`-variable warnings, shaped for
// this organization's own review process.
//
// Reach for `generateEnvArtifacts()` when you need output the CLI doesn't
// produce. If all you need is "generate the artifacts" or "fail CI when they
// drift", `env-cap ... ` / `env-cap ... --check` already does it, and a
// script wrapping it is one more thing to keep in sync.
import { generateEnvArtifacts } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = await generateEnvArtifacts({
  fs: nodeBuildFileSystem,
  root,
  manifest: { location: "src/generated/env.manifest.ts" },
  docs: {
    location: "docs/ENVIRONMENT.md",
    envExample: { location: ".env.example", onExisting: "overwrite" },
  },
  usage: { report: { location: "docs/OWNERSHIP.md" } },
  evidence: { location: "docs/env.evidence.json" },
});

console.log(`Wrote manifest: ${result.manifest?.outputPath}`);
console.log(`Wrote docs: ${result.docs?.docsPath}`);
console.log(`Wrote ownership report: ${result.usage?.reportPath}`);
console.log(`Discovered ${result.manifest?.contracts.length ?? 0} contract(s) across 6 capabilities.`);

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
