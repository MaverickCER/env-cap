// Build-time script. Run via `npm run generate:env` (warns, succeeds) or
// `npm run generate:env:strict` (ENV_CAP_STRICT=1, escalates the warning to
// a hard error). Never imported by application code.
import { generateEnvArtifacts } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.env.ENV_CAP_STRICT === "1";

const result = await generateEnvArtifacts({ fs: nodeBuildFileSystem,
  root,
  manifest: { location: "src/generated/env.manifest.ts", onIncompatibility: strict ? "throw" : "warn" },
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

// This is the whole point of this example: WEBHOOK_URL is documented
// differently by "notifications" and "audit-log" -- always a warning, never
// an error, unless ENV_CAP_STRICT escalates it via onIncompatibility: "throw"
// above (see generate:env:strict).
if (result.manifest?.warnings.length) {
  console.warn(`\n${result.manifest.warnings.length} compatibility warning(s):`);
  for (const warning of result.manifest.warnings) {
    const codePrefix = warning.code ? `[${warning.code}] ` : "";
    console.warn(` - ${codePrefix}${warning.variable}: ${warning.reason}`);
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
