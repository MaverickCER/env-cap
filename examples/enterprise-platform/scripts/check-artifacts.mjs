// The `--check` counterpart to generate-manifest.mjs -- see that script's
// own "ADVANCED TIER" header for why this example keeps hand-written
// scripts instead of calling the `env-cap` CLI directly (as `application`/
// `team-service` do). `env-cap --check` alone stopped being able to verify
// docs/ownership/env-example once `--docs`/`--ownership`/`--env-example`
// were removed from the CLI surface (see
// specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md);
// this replaces the CLI-flag-based `check` script this example used to run,
// with `env-cap/build`'s exported `checkEnvArtifacts()` called with the
// exact same options generate-manifest.mjs passes to `generateEnvArtifacts()`
// -- one call verifies every artifact (manifest, docs, envExample, usage,
// evidence) at once, matching this example's own existing "one call does
// everything" style.
import { checkEnvArtifacts } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = await checkEnvArtifacts({
  fs: nodeBuildFileSystem,
  root,
  manifest: { location: "src/generated/env.manifest.ts" },
  docs: {
    location: "docs/ENVIRONMENT.md",
    envExample: { location: ".env.example" },
  },
  usage: { report: { location: "docs/OWNERSHIP.md" } },
  evidence: { location: "docs/env.evidence.json" },
});

for (const finding of result.findings) {
  console.log(
    `  ${finding.artifact.padEnd(10)} ${finding.path.padEnd(50)} ${finding.status.toUpperCase()}${finding.detail ? ` (${finding.detail})` : ""}`,
  );
}

if (!result.ok) {
  console.error("\nOne or more artifacts are stale or missing. Run `npm run generate:env` to regenerate.");
  process.exitCode = 1;
} else {
  console.log("\nAll generated artifacts are up to date.");
}
