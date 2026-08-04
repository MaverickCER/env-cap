import { describe, expect, it } from "vitest";
import { compareGoldenArtifacts, isInstalled, runScript, runStart } from "./support.js";

/**
 * composable-boilerplates demonstrates multiple capability-owned contracts
 * in one app: two mutually-exclusive database backends (`postgres` active,
 * `mongodb` inactive) gated by `exclusiveGroup` (ADR 0009), plus `prisma`,
 * an always-active third contract layered on top. This file verifies:
 *  - `validateEnv()` succeeds with postgres active and mongodb excluded
 *    from the generated manifest entirely
 *  - every generated artifact byte-for-byte matches its `expected/` golden
 *    copy
 */
const EXAMPLE = "composable-boilerplates";
const ARTIFACTS = [
  "src/generated/env.manifest.ts",
  "src/generated/env.manifest.snapshot.json",
  "docs/ENVIRONMENT.md",
  "docs/OWNERSHIP.md",
  ".env.example",
];
const installed = isInstalled(EXAMPLE);

describe(EXAMPLE, () => {
  it.skipIf(!installed)("validates with postgres active, mongodb excluded", () => {
    const stdout = runStart(EXAMPLE);
    expect(stdout).toContain("Environment validated successfully.");
    expect(stdout).toContain("Prisma provider: postgresql");
    expect(stdout).toContain("Database URL: postgres://postgres:postgres@localhost:5432/app");
  });

  it.skipIf(!installed)("generated artifacts match their golden expected/ copies", async () => {
    runScript(EXAMPLE, "generate:env");
    await compareGoldenArtifacts(EXAMPLE, ARTIFACTS);
  });
});
