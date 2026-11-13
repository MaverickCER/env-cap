// The `--check` counterpart to generate-manifest.mjs. That script's "ADVANCED
// TIER" header says why this example keeps hand-written scripts instead of
// calling the `env-cap` CLI, as `application` and `team-service` do. The CLI
// checks only the manifest and the evidence file (ADR 0046). So this script
// calls `checkEnvArtifacts()` from `@maverickcer/env-cap/build` with the same
// options generate-manifest.mjs passes to `generateEnvArtifacts()`. One call
// checks every file: the manifest, docs, `.env.example`, the ownership report
// and the evidence file.
import { checkEnvArtifacts } from "@maverickcer/env-cap/build";
import { nodeBuildFileSystem } from "@maverickcer/env-cap/node";
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
