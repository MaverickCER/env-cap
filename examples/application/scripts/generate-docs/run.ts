// Regenerates docs/ENVIRONMENT.md, docs/OWNERSHIP.md, and .env.example --
// what `env-cap --docs`/`--ownership`/`--env-example` used to write for this
// example, before those flags were removed from the CLI surface (see
// specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md).
// Neither has a real *runtime* consumer -- nothing in this app `import`s
// ENVIRONMENT.md/OWNERSHIP.md/.env.example the way `src/startup.ts` imports
// the generated manifest -- so generating them moved from a CLI flag to
// plain application code, calling `@maverickcer/env-cap/build`'s still-fully-exported
// `generateDocumentation()`/`generateUsageReport()` directly. Run via
// `npm run docs:reports` (see package.json), which chains `npm run docs`
// first so `docs/env.evidence.json` -- the evidence artifact this script
// runs alongside -- is always current with what gets written here. See
// check.ts for the `--check` (drift-guard) counterpart, and this directory's
// own README for why this doesn't parse evidence.json directly.
import path from "node:path"
import { fileURLToPath } from "node:url"
import { generateDocumentation, generateUsageReport } from "@maverickcer/env-cap/build"
import { nodeBuildFileSystem } from "@maverickcer/env-cap/node"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const include = ["src/env.ts"]

const docs = await generateDocumentation({
  fs: nodeBuildFileSystem,
  root,
  include,
  location: "docs/ENVIRONMENT.md",
  envExample: { location: ".env.example", onExisting: "overwrite" },
})

const usage = await generateUsageReport({
  fs: nodeBuildFileSystem,
  root,
  include,
  report: { location: "docs/OWNERSHIP.md" },
})

console.log(
  `[generate-docs] wrote docs/ENVIRONMENT.md (${String(docs.contracts.length)} contract(s)), .env.example, and docs/OWNERSHIP.md (${String(usage.abandonedContracts.length)} abandoned, ${String(usage.unconsumedOwnedVariables.length)} unconsumed owned variable(s)).`,
)

// The two findings this example's own README leads with (see the root
// README's "Why it exists" transcript) -- printed by name here the same way
// the removed `--docs`/`--ownership` CLI flags used to, since a bare count
// in the one-liner above doesn't make the same concrete case on its own.
if (docs.documentation.expiringSoon.length > 0) {
  console.log(`\n${String(docs.documentation.expiringSoon.length)} variable(s)/contract(s) expiring soon or already expired:`)
  for (const e of docs.documentation.expiringSoon) {
    const label = e.key ? `${e.key} in ${e.exportName}` : e.exportName
    const status =
      e.daysRemaining < 0
        ? `expired ${String(Math.abs(e.daysRemaining))}d ago`
        : `${String(e.daysRemaining)}d remaining`
    console.log(`  - ${label}: ${e.expiresAt} (${status})`)
  }
}
if (usage.unconsumedOwnedVariables.length > 0) {
  console.log(`\n${String(usage.unconsumedOwnedVariables.length)} unconsumed owned variable(s):`)
  for (const v of usage.unconsumedOwnedVariables) {
    console.log(`  - ${v.key} in ${v.contractName}`)
  }
}
