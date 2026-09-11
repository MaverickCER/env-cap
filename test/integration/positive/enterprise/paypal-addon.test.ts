import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "vitest"
import { compareGoldenArtifacts, isInstalled, runScript } from "../../../support/example-runner.js"

/**
 * paypal-addon demonstrates a capability shipped as its own installable
 * package: generating its own contract/docs/`.env.example` in isolation
 * (`root` is this package's own directory), so it's documented and
 * browsable even without any consuming app installing it. See
 * paypal-consumer for the cross-package discovery half of this pair
 * (ADR 0014). This file verifies every generated artifact byte-for-byte
 * matches its `expected/` golden copy -- no `docs/OWNERSHIP.md`, since this
 * package's own generate script never requests a `usage` pass. No runtime
 * (`npm start`) assertion here: that's paypal-consumer's job, since
 * paypal-addon is a library, not an app with its own entry point.
 */
const EXAMPLE = "paypal-addon"
const EXAMPLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), EXAMPLE)
const ARTIFACTS = [
  "src/generated/env.manifest.ts",
  "docs/env.evidence.json",
  "docs/env.evidence.json.fingerprint",
  "docs/ENVIRONMENT.md",
  ".env.example",
]
const installed = isInstalled(EXAMPLE_DIR)

describe(EXAMPLE, () => {
  it.skipIf(!installed)("generated artifacts match their golden expected/ copies", async () => {
    runScript(EXAMPLE_DIR, "generate:env")
    await compareGoldenArtifacts(EXAMPLE_DIR, ARTIFACTS)
  })
})
