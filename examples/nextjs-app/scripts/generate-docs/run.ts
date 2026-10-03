// Regenerates docs/ENVIRONMENT.md, docs/OWNERSHIP.md, and .env.example --
// what `env-cap --docs`/`--ownership`/`--env-example` used to write for this
// example, before those flags were removed from the CLI surface (see
// specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md).
// Neither has a real *runtime* consumer -- nothing in this app `import`s
// ENVIRONMENT.md/OWNERSHIP.md/.env.example the way `src/env.ts` imports the
// generated manifest -- so generating them moved from a CLI flag to plain
// application code, calling `@maverickcer/env-cap/build`'s still-fully-exported
// `generateDocumentation()`/`generateUsageReport()` directly. Run via
// `npm run docs:reports` (see package.json), which chains `npm run docs`
// first so `docs/env.evidence.json` -- the evidence artifact this script
// runs alongside -- is always current with what gets written here.
//
// This does NOT parse `docs/env.evidence.json` itself: `generateDocumentation()`/
// `generateUsageReport()`'s own inputs (a freshly-linked `DiscoveredContract[]`
// graph, an `ImportResolutionContext` for the usage scan) aren't the
// persisted evidence artifact's shape (`ContractModel`/`EvidenceModel`, a
// separate, versioned projection -- see ADR 0038) and aren't reconstructible
// from it; `assembleProject()`/`computeScanSurface()` (the internal pass
// that produces them) are deliberately not part of `@maverickcer/env-cap/build`'s public
// surface (ADR 0010's "engine internals stay private" precedent). Each
// orchestrator below runs its own real discovery+link pass instead -- the
// same thing the removed CLI flags did under the hood -- rather than trying
// to rebuild that pass from the JSON artifact. See
// examples/nextjs-app/scripts/open-config-alignment (removed; see git
// history) for the sibling pattern this *would* follow if the job here were
// projecting over already-persisted evidence instead of rendering the full
// docs/ownership catalogs, which need the richer, pre-projection shape.
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
