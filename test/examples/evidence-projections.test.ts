import { describe, expect, it } from "vitest";
import { compareGoldenArtifacts, isInstalled, runScript } from "./support.js";

/**
 * evidence-projections demonstrates env-cap's ten first-party reference
 * projections (ADR 0024/0031/0032), each built entirely through the public
 * API -- generateEvidenceModel() (@maverickcer/env-cap/build) and
 * defineEvidenceProjection() (@maverickcer/env-cap/evidence) -- with no
 * privileged internal access, the same two entry points any consumer would
 * import. It reuses examples/basic-node's exact schema (src/env.ts) so each
 * projection's output can be verified against the existing, already-tested
 * rendering path on the exact same input.
 *
 * Each `project:*` npm script already runs `generate:env` first as its own
 * baseline step (see package.json) -- these tests don't call it separately
 * beforehand, to avoid redundant subprocess overhead across four tests each
 * spawning real `npm run` child processes.
 *
 * Phase 15: the ".env.example Artifact" -- byte-identical to the direct
 * generateEnvArtifacts() path, by construction (see projections/env-example.mjs).
 * Phase 16-18: verified via the standard expected/ golden-file mechanism
 * instead of byte-identity, since Contract Model's canonical ordering
 * (contracts and variables alike) diverges from the direct path's
 * scan/declaration order for schemas like this one -- see each
 * projection's own doc comment.
 */
const EXAMPLE = "evidence-projections";
const installed = isInstalled(EXAMPLE);

describe(EXAMPLE, () => {
  it.skipIf(!installed)(
    "projected .env.example matches its golden expected/ copy (byte-identical to the directly-generated one)",
    async () => {
      const stdout = runScript(EXAMPLE, "project:env-example");
      expect(stdout).toContain(
        "Projected .env.example is byte-identical to the directly-generated one.",
      );
      await compareGoldenArtifacts(EXAMPLE, [".env.example"]);
    },
  );

  it.skipIf(!installed)(
    "projected Environment Configuration Reference matches its golden expected/ copy",
    async () => {
      runScript(EXAMPLE, "project:config-reference");
      await compareGoldenArtifacts(EXAMPLE, ["projected-config-reference.md"]);
    },
  );

  it.skipIf(!installed)("projected Configuration Inventory matches its golden expected/ copy", async () => {
    runScript(EXAMPLE, "project:inventory");
    await compareGoldenArtifacts(EXAMPLE, ["projected-inventory.json"]);
  });

  it.skipIf(!installed)("projected Configuration Ownership matches its golden expected/ copy", async () => {
    runScript(EXAMPLE, "project:ownership");
    await compareGoldenArtifacts(EXAMPLE, ["projected-ownership.json"]);
  });

  it.skipIf(!installed)("projected Configuration Lifecycle matches its golden expected/ copy", async () => {
    runScript(EXAMPLE, "project:lifecycle");
    await compareGoldenArtifacts(EXAMPLE, ["projected-lifecycle.json"]);
  });
});
