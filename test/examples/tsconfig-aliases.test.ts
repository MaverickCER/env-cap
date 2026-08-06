import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareGoldenArtifacts, examplesRoot, isInstalled, runScript, runStart } from "./support.js";

/**
 * tsconfig-aliases demonstrates ADR 0023: a contract
 * (`src/features/payments/env.schema.ts`) imported only through the `"@/*"`
 * tsconfig path alias declared in this example's own `tsconfig.json`, never
 * a relative import, and never opted into via a `tsconfig` option --
 * `generate:env` doesn't pass one, relying entirely on auto-detection. This
 * file verifies:
 *  - the runtime import resolves (both `tsx` and `env-cap`'s static
 *    analysis independently resolve the same alias against the same
 *    `tsconfig.json`)
 *  - the generated Dependency & Ownership Report does NOT list the contract
 *    as abandoned, and does list `src/server.ts` as its consumer -- the
 *    actual bug this ADR fixes
 *  - every generated artifact byte-for-byte matches its `expected/` golden
 *    copy
 */
const EXAMPLE = "tsconfig-aliases";
const ARTIFACTS = [
  "src/generated/env.manifest.ts",
  "src/generated/env.manifest.snapshot.json",
  "docs/ENVIRONMENT.md",
  "docs/OWNERSHIP.md",
  ".env.example",
];
const installed = isInstalled(EXAMPLE);

describe(EXAMPLE, () => {
  it.skipIf(!installed)("validates and reads the contract imported only through the tsconfig path alias", () => {
    const stdout = runStart(EXAMPLE);
    expect(stdout).toContain("Environment validated successfully.");
    expect(stdout).toContain("Stripe key: sk_test_fake_1234567890");
  });

  it.skipIf(!installed)(
    "the alias-only-imported contract is not reported abandoned, and docs/OWNERSHIP.md names its real consumer",
    () => {
      const stdout = runScript(EXAMPLE, "generate:env");
      expect(stdout).toContain("Discovered 1 contract(s).");
      expect(stdout).toContain("No abandoned contracts -- the alias-only import was resolved correctly.");
      expect(stdout).not.toContain("abandoned contract(s)");
    },
  );

  it.skipIf(!installed)(
    "STRIPE_KEY -- the contract's one variable, actually member-accessed via the alias -- is neither unconsumed nor indeterminate",
    async () => {
      runScript(EXAMPLE, "generate:env");
      const report = await fs.readFile(path.join(examplesRoot, EXAMPLE, "docs/OWNERSHIP.md"), "utf8");
      // These section headers only ever render when their findings array is
      // non-empty (see renderUnconsumedOwned()/renderIndeterminate() in
      // src/build/usage-report.ts) -- their absence here is a direct,
      // explicit assertion, not just an inference from the golden byte-diff
      // the next test already performs.
      expect(report).not.toContain("## Unconsumed owned dependencies");
      expect(report).not.toContain("## Indeterminate (dynamic access)");
      expect(report).toContain("| payments (`src/features/payments/env.schema.ts`) | payments-team | 1 | src/server.ts | 1 |");
    },
  );

  it.skipIf(!installed)("generated artifacts match their golden expected/ copies", async () => {
    runScript(EXAMPLE, "generate:env");
    await compareGoldenArtifacts(EXAMPLE, ARTIFACTS);
  });
});
