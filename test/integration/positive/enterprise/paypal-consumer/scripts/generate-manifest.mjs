// Build-time script. Run via `npm run generate:env`. Never imported by application code.
//
// root is this package's own directory, exactly like examples/application --
// no shared-parent-directory workaround needed. discoverSchemaFiles() still
// always prunes `node_modules` during its own walk (see specs/architecture.md's
// "build/" section) and finds this app's own src/env.schema.ts via the
// default include glob. paypal-addon's contract, which lives only inside
// this package's node_modules copy (installed from a real packed tarball --
// see ../paypal-addon/README.md), is discovered through the explicit,
// opt-in `packages` allowlist instead (ADR 0014, Experimental): it never
// walks node_modules, it just resolves paypal-addon's own declared
// "envCap.schema" package.json field.
import { generateEnvArtifacts } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = await generateEnvArtifacts({ fs: nodeBuildFileSystem,
  root,
  packages: ["@examples/paypal-addon"],
  manifest: { location: "src/env.manifest.ts" },
  docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example", onExisting: "overwrite" } },
  evidence: { location: "docs/env.evidence.json" },
});

console.log(`Wrote manifest: ${result.manifest?.outputPath}`);
console.log(`Wrote docs: ${result.docs?.docsPath}`);
console.log(`Discovered ${result.manifest?.contracts.length ?? 0} contract(s):`);
for (const contract of result.manifest?.contracts ?? []) {
  console.log(` - ${contract.exportName} (${contract.file})`);
}

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

if (result.manifest?.parseWarnings.length) {
  console.warn(`\n${result.manifest.parseWarnings.length} parse warning(s):`);
  for (const warning of result.manifest.parseWarnings) {
    console.warn(` - ${warning.file}: ${warning.message}`);
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
