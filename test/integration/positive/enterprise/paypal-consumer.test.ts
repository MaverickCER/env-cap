import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  compareGoldenArtifacts,
  isInstalled,
  runScript,
  runStart,
} from "../../../support/example-runner.js"

/**
 * paypal-consumer demonstrates cross-package schema discovery (ADR 0014,
 * Experimental): its own contract plus paypal-addon's, discovered across a
 * real package boundary via the `packages` allowlist option, installed from
 * a real packed tarball (`npm run pack:local` in paypal-addon), not a
 * monorepo/workspace reference. This file verifies:
 *  - `validateEnv()` succeeds against both contracts together, and the
 *    generated checkout session flow runs
 *  - every generated artifact (manifest at `src/env.manifest.ts`, not
 *    `src/generated/...` -- this example's own choice) byte-for-byte
 *    matches its `expected/` golden copy -- no `docs/OWNERSHIP.md`, since
 *    this script never requests a `usage` pass
 */
const EXAMPLE = "paypal-consumer"
const EXAMPLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), EXAMPLE)
const ARTIFACTS = [
  "src/env.manifest.ts",
  "docs/env.evidence.json",
  "docs/env.evidence.json.fingerprint",
  "docs/ENVIRONMENT.md",
  ".env.example",
]
const installed = isInstalled(EXAMPLE_DIR)

describe(EXAMPLE, () => {
  it.skipIf(!installed)(
    "validates its own contract and paypal-addon's cross-package contract together",
    () => {
      const stdout = runStart(EXAMPLE_DIR)
      expect(stdout).toContain("Environment validated successfully.")
      expect(stdout).toContain("Starting paypal-consumer on port 3000...")
      expect(stdout).toContain("PayPal client: sandbox-client-id-placeholder")
      expect(stdout).toContain("Created checkout session:")
    },
  )

  it.skipIf(!installed)("generated artifacts match their golden expected/ copies", async () => {
    runScript(EXAMPLE_DIR, "generate:env")
    await compareGoldenArtifacts(EXAMPLE_DIR, ARTIFACTS)
  })
})
