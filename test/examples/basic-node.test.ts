import { describe, expect, it } from "vitest";
import { compareGoldenArtifacts, isInstalled, runScript, runStart } from "./support.js";

/**
 * basic-node demonstrates the simplest possible starting point: one
 * centralized `createEnv()` contract for a whole small app -- no
 * capability-per-file ownership required -- generated via a custom
 * `generateEnvArtifacts()` script (see examples/cli-usage for the packaged
 * CLI-binary equivalent of the same contract). This file verifies:
 *  - fail-fast `validateEnv()` startup against the real, committed `.env`
 *  - every generated artifact (manifest, its ADR-0021 change-tracking
 *    snapshot, docs/ENVIRONMENT.md, docs/OWNERSHIP.md, .env.example)
 *    byte-for-byte matches its `expected/` golden copy
 */
const EXAMPLE = "basic-node";
const ARTIFACTS = [
  "src/generated/env.manifest.ts",
  "src/generated/env.manifest.snapshot.json",
  "docs/ENVIRONMENT.md",
  "docs/OWNERSHIP.md",
  ".env.example",
];
const installed = isInstalled(EXAMPLE);

describe(EXAMPLE, () => {
  it.skipIf(!installed)("validates and prints the resolved centralized contract", () => {
    const stdout = runStart(EXAMPLE);
    expect(stdout).toContain("Environment validated successfully.");
    expect(stdout).toContain("Connecting to database on port 5432...");
    expect(stdout).toContain("Payment provider: stripe");
    expect(stdout).toContain("Log level: info");
  });

  it.skipIf(!installed)("generated artifacts match their golden expected/ copies", async () => {
    runScript(EXAMPLE, "generate:env");
    await compareGoldenArtifacts(EXAMPLE, ARTIFACTS);
  });
});
