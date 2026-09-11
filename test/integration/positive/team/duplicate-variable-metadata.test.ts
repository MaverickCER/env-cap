import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  compareGoldenArtifacts,
  isInstalled,
  runExpectingFailure,
  runScript,
  runStart,
} from "../../../support/example-runner.js"

/**
 * duplicate-variable-metadata demonstrates the `duplicate-variable-documentation`
 * warning: two independently-owned, both-active contracts (`notifications`,
 * `audit-log`) declare the same variable key (WEBHOOK_URL) with different
 * documented metadata. Unlike missing-env-var and
 * multiple-active-exclusive-capabilities, **this is a third category, not
 * "broken"**: generation succeeds by default (the check is always
 * warning-tier, see ADR 0021's "Alternatives considered"). This file
 * verifies:
 *  - `npm start` succeeds and prints both contracts' independent copies of
 *    WEBHOOK_URL (duplicate variable names are never merged at runtime)
 *  - `generate:env`'s warning names both contract names and lists exactly
 *    which fields diverge, and every generated artifact byte-for-byte
 *    matches its `expected/` golden copy
 *  - `generate:env:strict` (ENV_CAP_STRICT=1) escalates the same divergence
 *    to a hard `EnvProjectGenerationError` instead
 */
const EXAMPLE = "duplicate-variable-metadata"
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
  it.skipIf(!installed)(
    "succeeds and prints each contract's own independent copy of the shared variable name",
    () => {
      const stdout = runStart(EXAMPLE_DIR)
      expect(stdout).toContain("Environment validated successfully.")
      expect(stdout).toContain("Notifications webhook:")
      expect(stdout).toContain("Audit log webhook:")
    },
  )

  it.skipIf(!installed)(
    "generate:env warns (never errors) naming both contracts and every diverging field, and every artifact matches its golden expected/ copy",
    async () => {
      const stdout = runScript(EXAMPLE_DIR, "generate:env")
      expect(stdout).toContain("DUPLICATE_VARIABLE_DOCUMENTATION")
      expect(stdout).toContain("WEBHOOK_URL")
      expect(stdout).toContain("audit-log")
      expect(stdout).toContain("notifications")
      expect(stdout).toContain("description")
      expect(stdout).toContain("owner")
      expect(stdout).toContain("expiresAt")
      expect(stdout).toContain("required")

      await compareGoldenArtifacts(EXAMPLE_DIR, ARTIFACTS)
    },
  )

  it.skipIf(!installed)("generate:env:strict escalates the same divergence to a hard error", () => {
    const output = runExpectingFailure(EXAMPLE_DIR, "generate:env:strict")
    expect(output).toContain("EnvProjectGenerationError")
    expect(output).toContain("DUPLICATE_VARIABLE_DOCUMENTATION")
    expect(output).toContain("WEBHOOK_URL")
  })
})
