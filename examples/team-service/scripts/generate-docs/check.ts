// The `--check` counterpart to run.ts (see its own header comment and this
// directory's README for why this exists as application code rather than a
// CLI flag): verifies docs/ENVIRONMENT.md, docs/OWNERSHIP.md, and
// .env.example are exactly what a fresh run.ts would produce, without
// writing anything, via `env-cap/build`'s exported `checkEnvArtifacts()` --
// the same function the removed `env-cap --check --docs --ownership
// --env-example` combination called internally. `env-cap --check` itself
// (see package.json's `check` script, chained before this) still separately
// verifies the manifest and the persisted evidence artifact -- the two
// outputs that DO have a real consumer/contract, per ADR 0046 -- so between
// the two, every artifact this example generates is still drift-checked
// exactly as it was before.
import path from "node:path"
import { fileURLToPath } from "node:url"
import { checkEnvArtifacts } from "env-cap/build"
import { nodeBuildFileSystem } from "env-cap/node"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

const result = await checkEnvArtifacts({
  fs: nodeBuildFileSystem,
  root,
  docs: {
    location: "docs/ENVIRONMENT.md",
    envExample: { location: ".env.example" },
  },
  usage: { report: { location: "docs/OWNERSHIP.md" } },
})

for (const finding of result.findings) {
  console.log(
    `  ${finding.artifact.padEnd(10)} ${finding.path.padEnd(50)} ${finding.status.toUpperCase()}${finding.detail ? ` (${finding.detail})` : ""}`,
  )
}

if (!result.ok) {
  console.error(
    "\n[generate-docs check] one or more docs/ownership artifacts are stale or missing. Run `npm run docs:reports` to regenerate.",
  )
  process.exitCode = 1
} else {
  console.log("\n[generate-docs check] docs/ownership artifacts are up to date.")
}
