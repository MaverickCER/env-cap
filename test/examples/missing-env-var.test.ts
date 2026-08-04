import { describe, expect, it } from "vitest";
import { compareGoldenArtifacts, isInstalled, runExpectingFailure, runScript } from "./support.js";

/**
 * missing-env-var is deliberately, permanently broken -- unlike every other
 * example in this file's cohort -- to fix one specific failure mode in
 * place: a required variable (STRIPE_KEY) missing from the committed `.env`.
 * Static discovery never reads `.env` values (ADR 0002), so `generate:env`
 * itself still succeeds and every artifact still golden-compares; only
 * `npm start`'s real `validateEnv()` call fails. This file verifies:
 *  - `validateEnv()` aggregates the missing STRIPE_KEY onto the payments
 *    contract, and the database contract never gets a chance to run at all
 *    (proven by asserting its "Database URL:" log line never appears, not
 *    just that payments was the one reported broken)
 *  - every generated artifact still byte-for-byte matches its `expected/`
 *    golden copy, since generation itself never fails here
 */
const EXAMPLE = "missing-env-var";
const ARTIFACTS = ["src/generated/env.manifest.ts", "src/generated/env.manifest.snapshot.json", "docs/ENVIRONMENT.md", ".env.example"];
const installed = isInstalled(EXAMPLE);

describe(EXAMPLE, () => {
  it.skipIf(!installed)(
    "validateEnv() aggregates the missing STRIPE_KEY onto the payments contract, and database never runs",
    () => {
      const output = runExpectingFailure(EXAMPLE, "start");
      expect(output).toContain("EnvValidationError");
      expect(output).toContain("STRIPE_KEY");
      expect(output).toContain("payments");
      expect(output).toContain("STRIPE_KEY is required.");
      expect(output).not.toContain("Database URL:");
    },
  );

  it.skipIf(!installed)("generated artifacts match their golden expected/ copies (generation succeeds -- only the runtime validateEnv() call fails)", async () => {
    runScript(EXAMPLE, "generate:env");
    await compareGoldenArtifacts(EXAMPLE, ARTIFACTS);
  });
});
