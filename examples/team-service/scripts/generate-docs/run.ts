// Regenerates docs/ENVIRONMENT.md, docs/OWNERSHIP.md and .env.example by
// calling `generateDocumentation()` and `generateUsageReport()` from
// `@maverickcer/env-cap/build`. Nothing in the service imports these files at
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

const docs = await generateDocumentation({
  fs: nodeBuildFileSystem,
  root,
  location: "docs/ENVIRONMENT.md",
  envExample: { location: ".env.example", onExisting: "overwrite" },
})

const usage = await generateUsageReport({
  fs: nodeBuildFileSystem,
  root,
  report: { location: "docs/OWNERSHIP.md" },
})

console.log(
  `[generate-docs] wrote docs/ENVIRONMENT.md (${String(docs.contracts.length)} contract(s)), .env.example, and docs/OWNERSHIP.md (${String(usage.abandonedContracts.length)} abandoned, ${String(usage.unconsumedOwnedVariables.length)} unconsumed owned variable(s)).`,
)
