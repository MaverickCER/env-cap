// Build-time script. Run via `npm run generate:env`. Never imported by
// application code.
//
// Unlike every other example in this repo, this script needs a real JS value
// from `src/` (the `liveExpirationDates` callback), not just plain strings and
// booleans -- so it runs via `tsx`, not plain `node` (see this package's
// README, "Why tsx instead of node"). `tsx`'s loader hooks apply to the whole
// module graph, so this `.mjs` entry point can still import a `.ts` module
// the same way every other example's `src/index.ts` does.
import { generateEnvArtifacts } from "@maverickcer/env-cap/build";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveExpirationDates } from "../src/live-expirations.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = await generateEnvArtifacts({
  root,
  manifest: { location: "src/generated/env.manifest.ts" },
  docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example", onExisting: "overwrite" } },
  liveExpirationDates,
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
