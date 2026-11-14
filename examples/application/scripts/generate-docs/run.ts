// Regenerates docs/ENVIRONMENT.md, docs/OWNERSHIP.md and .env.example by
// calling `generateDocumentation()` and `generateUsageReport()` from
// `@maverickcer/env-cap/build`. Nothing in the app imports these files at
// runtime, so the CLI does not write them; it writes only the manifest and the
// evidence file (specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md).
// `npm run docs:reports` runs `npm run docs` first, so `docs/env.evidence.json`
// is current alongside them. check.ts is the drift-guard counterpart, and this
// directory's README says why this script does not parse the evidence file.
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

// Prints the two findings the root README's "See it run" block shows, by name:
// a bare count in the line above does not show which variable to act on.
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
