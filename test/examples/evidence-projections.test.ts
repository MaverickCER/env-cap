import { describe, expect, it } from "vitest";
import { compareGoldenArtifacts, isInstalled, runScript } from "./support.js";

/**
 * evidence-projections demonstrates env-cap's ten first-party reference
 * projections (ADR 0024/0031/0032), each built entirely through the public
 * API -- generateEvidenceModel() (@maverickcer/env-cap/build) and
 * defineEvidenceProjection() (@maverickcer/env-cap/evidence) -- with no
 * privileged internal access, the same two entry points any consumer would
 * import. It reuses examples/basic-node's exact schema (src/env.ts) so each
 * projection's output can be verified byte-identical to the existing,
 * already-tested rendering path on the exact same input.
 *
 * Phase 15 (the first projection landed): the ".env.example Artifact".
 */
const EXAMPLE = "evidence-projections";
const installed = isInstalled(EXAMPLE);

describe(EXAMPLE, () => {
  it.skipIf(!installed)(
    "projected .env.example matches its golden expected/ copy (byte-identical to the directly-generated one)",
    async () => {
      runScript(EXAMPLE, "generate:env");
      const stdout = runScript(EXAMPLE, "project:env-example");
      expect(stdout).toContain(
        "Projected .env.example is byte-identical to the directly-generated one.",
      );
      await compareGoldenArtifacts(EXAMPLE, [".env.example"]);
    },
  );
});
