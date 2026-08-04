import { describe, it } from "vitest";
import { compareGoldenArtifacts, isInstalled, runScript } from "./support.js";

/**
 * aws-secrets-manager demonstrates the `liveExpirationDates` callback,
 * sourcing a variable's `expiresAt` from a live external system (AWS
 * Secrets Manager's rotation metadata) instead of only the static value set
 * in `documentEnv()`, with graceful fallback to that static value when the
 * live call fails or is unavailable -- as in CI, where no AWS credentials
 * are configured, so `generate:env` still succeeds. This file verifies
 * every generated artifact byte-for-byte matches its `expected/` golden
 * copy; the docs comparison specifically exercises the date-relative-text
 * normalizer (`normalizeDocsForComparison`), since this example's static
 * fallback `expiresAt` values render lifecycle-report annotations. No
 * `docs/OWNERSHIP.md` (no `usage` pass requested) and no runtime (`npm
 * start`) assertion here -- this example's whole point is the generation-time
 * `liveExpirationDates` behavior, already exercised by `npm run generate:env`
 * below; `src/live-expirations.ts`'s own fallback logic has its own focused
 * unit coverage outside this example.
 */
const EXAMPLE = "aws-secrets-manager";
const ARTIFACTS = ["src/generated/env.manifest.ts", "src/generated/env.manifest.snapshot.json", "docs/ENVIRONMENT.md", ".env.example"];
const installed = isInstalled(EXAMPLE);

describe(EXAMPLE, () => {
  it.skipIf(!installed)("generated artifacts match their golden expected/ copies", async () => {
    runScript(EXAMPLE, "generate:env");
    await compareGoldenArtifacts(EXAMPLE, ARTIFACTS);
  });
});
