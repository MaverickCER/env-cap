// Regenerates docs/SECRETS-ROTATION-LOG.md, an internal secrets-rotation
// record organized around NIST SP 800-53 IA-5. It supports a review and is not
// a compliance attestation; the generated file says so. It uses the lifecycle
// fields ENVIRONMENT.md already shows (`expiresAt`, `refreshInstructions`) plus
// `authenticatorType`, `rotationPeriod`, `lastRotatedAt` and
// `rotationTriggerEvents`. This directory's README describes each file.
//
// It reads the generated `docs/env.evidence.json` through `getEvidenceModel()`
// instead of re-running discovery. That file's Lifecycle Model already holds
// every rotation field and env-cap's computed `rotationStatus`.
// ../generate-docs/run.ts re-runs discovery because ENVIRONMENT.md and
// OWNERSHIP.md need more than the evidence file holds. `npm run docs:reports`
// runs `npm run docs` first, so the evidence file is current when this runs.
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getEvidenceModel } from "@maverickcer/env-cap/build"
import { nodeBuildFileSystem } from "@maverickcer/env-cap/node"
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
// that wants the raw computed values (not this file's own Markdown
// rendering) gets them straight from `buildRotationLogModel()`, and here's
// exactly what that looks like on the console.
console.log("\n[rotation-log] raw model (via printJsonLines):")
printJsonLines(model, console.log)
