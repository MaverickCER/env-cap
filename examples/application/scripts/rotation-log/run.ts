// Regenerates docs/SECRETS-ROTATION-LOG.md -- a NIST SP 800-53 IA-5
// secrets-rotation compliance document, built on top of the same
// `expiresAt`/`refreshInstructions` lifecycle fields ENVIRONMENT.md already
// uses (see ../generate-docs), plus the newer `authenticatorType`/
// `rotationPeriod`/`lastRotatedAt`/`rotationTriggerEvents` fields. Peer to
// ../generate-docs (C5's own generator, same directory-per-generator
// convention this repo already established) -- see this directory's own
// README for the full architecture (types.ts/build-model.ts/render.ts/
// print-lines.ts/run.ts).
//
// Unlike ../generate-docs/run.ts (which re-runs discovery via
// generateDocumentation()/generateUsageReport(), since ENVIRONMENT.md/
// OWNERSHIP.md need richer output than the persisted evidence JSON carries),
// this script reads the already-generated `docs/env.evidence.json` via
// `getEvidenceModel()` -- the Lifecycle Model it carries already has every
// rotation field plus env-cap's own computed `rotationStatus`, so there's
// nothing this generator needs that a fresh discovery pass would add. Run
// via `npm run docs:reports` (see package.json), which runs `npm run docs`
// first so the evidence artifact this script reads is always current.
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getEvidenceModel } from "env-cap/build"
import { nodeBuildFileSystem } from "env-cap/node"
import { buildRotationLogModel } from "./build-model.js"
import { printJsonLines } from "./print-lines.js"
import { renderRotationLog } from "./render.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const include = ["src/env.ts"]

const { evidence, source } = await getEvidenceModel({
  fs: nodeBuildFileSystem,
  root,
  include,
  location: "docs/env.evidence.json",
})

const model = buildRotationLogModel(evidence)

const outputPath = path.resolve(root, "docs/SECRETS-ROTATION-LOG.md")
await fs.writeFile(outputPath, renderRotationLog(model), "utf8")

console.log(
  `[rotation-log] wrote docs/SECRETS-ROTATION-LOG.md (${String(model.entries.length)} entry(ies), evidence ${source}).`,
)

// The `build-model.ts` escape hatch this generator's README promises: an org
// that wants the raw computed values -- not this file's own Markdown
// rendering -- gets them straight from `buildRotationLogModel()`, and here's
// exactly what that looks like on the console.
console.log("\n[rotation-log] raw model (via printJsonLines):")
printJsonLines(model, console.log)
