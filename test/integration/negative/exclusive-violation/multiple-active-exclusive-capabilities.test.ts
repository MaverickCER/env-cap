import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { isInstalled, runExpectingFailure } from "../../../support/example-runner.js"

/**
 * multiple-active-exclusive-capabilities is deliberately, permanently
 * broken -- two active contracts (`mongodb`, `postgres`) sharing an
 * `exclusiveGroup` -- to fix that one specific failure mode in place.
 * Unlike missing-env-var, generation itself always fails here (ADR 0009:
 * exclusive-group violations are always hard errors, never gated by
 * `onIncompatibility`), so there is no successfully-generated artifact set
 * for this fixture and therefore **no golden comparison** -- `generate:env`
 * (and therefore `typecheck`/`start`, which both run it first) never gets
 * past generation to write anything at all. This file verifies
 * `generate:env` fails with the exact `EnvProjectGenerationError` content
 * naming both contracts, the shared group, and the reason.
 */
const EXAMPLE = "multiple-active-exclusive-capabilities"
const EXAMPLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), EXAMPLE)
const installed = isInstalled(EXAMPLE_DIR)

describe(EXAMPLE, () => {
  it.skipIf(!installed)(
    "generate:env always rejects two active members of the same exclusiveGroup",
    () => {
      const output = runExpectingFailure(EXAMPLE_DIR, "generate:env")
      expect(output).toContain("EnvProjectGenerationError")
      expect(output).toContain('Exclusive group "database"')
      expect(output).toContain("mongodb")
      expect(output).toContain("postgres")
      expect(output).toContain("exclusiveGroup")
    },
  )
})
