import { describe, expect, it } from "vitest"
import {
  checkArtifactsFresh,
  isExampleInstalled,
  runExampleScript,
  runExampleStart,
} from "./support.js"

/**
 * enterprise-platform (examples/enterprise-platform) is the third of
 * env-cap's three flagship examples -- "how does this help my organization?"
 * A real TanStack Start + MongoDB matter tracker, using
 * `defineEvidenceProjection()` to produce a configuration-governance evidence
 * report built on exact source-position evidence (ADR 0036/0037).
 *
 * The one flagship that keeps a hand-written `scripts/generate-manifest.mjs`
 * rather than calling the CLI directly, because it does genuine custom
 * reporting (per-contract blast radius, stale-`.env.example` warnings) the
 * CLI doesn't produce -- see that script's own "ADVANCED TIER" header. Its
 * `check` script is still the plain CLI drift guard, so the freshness
 * assertion below is identical to the other two examples'.
 *
 * This file verifies:
 *  - the committed generated output matches a fresh generation
 *  - the evidence-contract test (no Mongo, no dev server, no browser) passes
 *  - the headless application smoke test passes against a real
 *    mongodb-memory-server + s3rver, diffing its own `expected/output.json`
 *    internally -- that file is the example's own runtime self-check, not a
 *    mirror of env-cap's generated output, and deliberately stays
 */
const EXAMPLE = "enterprise-platform"
const installed = isExampleInstalled(EXAMPLE)

// Every test here shells out to a real npm script spawning its own Node
// process; the headless smoke test additionally starts two real background
// servers, so it gets the most generous budget.
const SUBPROCESS_TIMEOUT_MS = 30_000
const HEADLESS_SMOKE_TEST_TIMEOUT_MS = 60_000

describe(`example: ${EXAMPLE}`, () => {
  it.skipIf(!installed)(
    "has committed generated output matching a fresh generation",
    () => {
      checkArtifactsFresh(EXAMPLE)
    },
    SUBPROCESS_TIMEOUT_MS,
  )

  it.skipIf(!installed)(
    "evidence-contract test passes -- no Mongo, no dev server, no browser",
    () => {
      const stdout = runExampleScript(EXAMPLE, "test:evidence")
      expect(stdout).toMatch(/passed/i)
    },
    SUBPROCESS_TIMEOUT_MS,
  )

  it.skipIf(!installed)(
    "headless application smoke test passes against a real mongodb-memory-server and s3rver",
    () => {
      const stdout = runExampleStart(EXAMPLE)
      expect(stdout).toContain("Headless smoke test passed")
    },
    HEADLESS_SMOKE_TEST_TIMEOUT_MS,
  )
})
