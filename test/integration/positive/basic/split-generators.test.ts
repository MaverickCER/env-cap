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
 * split-generators demonstrates the three standalone, "Stable"-tier
 * generator functions (`generateEnvManifest()`, `generateDocumentation()`,
 * `generateUsageReport()`) called independently instead of through the
 * combined `generateEnvArtifacts()` orchestrator every other example uses
 * -- see README.md for the real trade-off (three independent discovery/
 * link passes instead of one shared pass, ADR 0011; three distinct error
 * types instead of one aggregated one). It reuses basic-node's exact
 * contract on purpose, so this file verifies the same runtime behavior
 * basic-node's own test does, plus that every generated artifact is
 * byte-for-byte identical to what the combined call produces for that same
 * contract -- proven by golden-comparing against `expected/`, which was
 * seeded from those same underlying `render*()` functions.
 */
const EXAMPLE = "split-generators"
const EXAMPLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), EXAMPLE)
const ARTIFACTS = [
  "src/generated/env.manifest.ts",
  "docs/env.evidence.json",
  "docs/env.evidence.json.fingerprint",
  "docs/ENVIRONMENT.md",
  "docs/OWNERSHIP.md",
  ".env.example",
]
const installed = isInstalled(EXAMPLE_DIR)

describe(EXAMPLE, () => {
  it.skipIf(!installed)(
    "validates and prints the resolved centralized contract, same as basic-node",
    () => {
      const stdout = runStart(EXAMPLE_DIR)
      expect(stdout).toContain("Environment validated successfully.")
      expect(stdout).toContain("Connecting to database on port 5432...")
      expect(stdout).toContain("Payment provider: stripe")
      expect(stdout).toContain("Log level: info")
    },
  )

  it.skipIf(!installed)("generated artifacts match their golden expected/ copies", async () => {
    runScript(EXAMPLE_DIR, "generate:env")
    await compareGoldenArtifacts(EXAMPLE_DIR, ARTIFACTS)
  })
})
