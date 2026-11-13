// Regenerates docs/ENVIRONMENT.md, docs/OWNERSHIP.md and .env.example by
// calling `generateDocumentation()` and `generateUsageReport()` from
// `@maverickcer/env-cap/build`. Nothing in the app imports these files at
// runtime, so the CLI does not write them; it writes only the manifest and the
// evidence file (specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md).
// `npm run docs:reports` runs `npm run docs` first, so `docs/env.evidence.json`
// is current alongside them.
//
// It runs its own discovery pass instead of reading `docs/env.evidence.json`.
// The two generators need the linked contract graph and the import-resolution
// context. The evidence file holds a projected shape (ADR 0038) that cannot
// rebuild them, and the pass that builds them stays private to `./build`
// (ADR 0010).
import path from "node:path"
import { fileURLToPath } from "node:url"
import { generateDocumentation, generateUsageReport } from "@maverickcer/env-cap/build"
import { nodeBuildFileSystem } from "@maverickcer/env-cap/node"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const include = ["src/features/**/env.*.schema.ts"]

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
