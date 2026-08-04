// Build-time script. Run via `npm run generate:env` (warns, succeeds) or
// `npm run generate:env:strict` (ENV_CAP_STRICT=1, escalates the warning to
// a hard error). Never imported by application code.
import { generateEnvArtifacts } from "@maverickcer/env-cap/build";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.env.ENV_CAP_STRICT === "1";

const result = await generateEnvArtifacts({
  root,
  manifest: { location: "src/generated/env.manifest.ts", onIncompatibility: strict ? "throw" : "warn" },
  docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example", onExisting: "overwrite" } },
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
