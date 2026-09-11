import fs from "node:fs/promises"
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
 * tsconfig-aliases-consumer proves that tsconfig path-alias resolution
 * (ADR 0023) and cross-package schema discovery (ADR 0014, Experimental)
 * compose correctly in one real install, not just in isolated unit tests:
 * `src/app.ts` imports its own local contract through this example's own
 * "@/*" tsconfig alias, and @examples/tsconfig-aliases's contract through a
 * real installed package (a packed tarball from `npm run pack:local` in
 * ../tsconfig-aliases, not a monorepo/workspace reference). This file
 * verifies:
 *  - `validateEnv()` succeeds against both contracts together, and both
 *    resolved values are read
 *  - neither contract is reported abandoned -- the actual bug both ADRs fix
 *  - every generated artifact byte-for-byte matches its `expected/` golden
 *    copy
 */
const EXAMPLE = "tsconfig-aliases-consumer"
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
    "validates its own alias-organized contract and the cross-package contract together",
    () => {
      const stdout = runStart(EXAMPLE_DIR)
      expect(stdout).toContain("Environment validated successfully.")
      expect(stdout).toContain("Billing webhook secret: whsec_fake_local_dev_secret")
      expect(stdout).toContain(
        "Stripe key (from @examples/tsconfig-aliases): sk_test_fake_1234567890",
      )
    },
  )

  it.skipIf(!installed)(
    "neither the local alias-organized contract nor the cross-package contract is reported abandoned",
    () => {
      const stdout = runScript(EXAMPLE_DIR, "generate:env")
      expect(stdout).toContain("Discovered 2 contract(s):")
      expect(stdout).toContain(
        "No abandoned contracts -- both the local alias-organized and cross-package contracts were resolved correctly.",
      )
      expect(stdout).not.toContain("abandoned contract(s)")
    },
  )

  it.skipIf(!installed)(
    "BILLING_WEBHOOK_SECRET and STRIPE_KEY -- both actually member-accessed in src/app.ts -- are neither unconsumed nor indeterminate",
    async () => {
      runScript(EXAMPLE_DIR, "generate:env")
      const report = await fs.readFile(path.join(EXAMPLE_DIR, "docs/OWNERSHIP.md"), "utf8")
      // These section headers only ever render when their findings array is
      // non-empty (see renderUnconsumedOwned()/renderIndeterminate() in
      // src/build/usage-report.ts) -- their absence here is a direct,
      // explicit assertion, not just an inference from the golden byte-diff
      // the next test already performs.
      expect(report).not.toContain("## Unconsumed owned dependencies")
      expect(report).not.toContain("## Indeterminate (dynamic access)")
      expect(report).toContain(
        "| billing (`src/features/billing/env.schema.ts`) | billing-team | 1 | src/app.ts | 1 |",
      )
      expect(report).toContain(
        "| payments (`node_modules/@examples/tsconfig-aliases/src/features/payments/env.schema.ts`) | payments-team | 1 | src/app.ts | 1 |",
      )
    },
  )

  it.skipIf(!installed)("generated artifacts match their golden expected/ copies", async () => {
    runScript(EXAMPLE_DIR, "generate:env")
    await compareGoldenArtifacts(EXAMPLE_DIR, ARTIFACTS)
  })
})
