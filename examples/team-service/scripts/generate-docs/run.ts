// Regenerates docs/ENVIRONMENT.md, docs/OWNERSHIP.md, and .env.example --
// what `env-cap --docs`/`--ownership`/`--env-example` used to write for this
// example, before those flags were removed from the CLI surface (see
// specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md).
// Neither has a real *runtime* consumer -- nothing in this service `import`s
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
