import { describe, it } from "vitest";
import { compareGoldenArtifacts, isInstalled, runScript } from "./support.js";

/**
 * paypal-addon demonstrates a capability shipped as its own installable
 * package: generating its own contract/docs/`.env.example` in isolation
 * (`root` is this package's own directory), so it's documented and
 * browsable even without any consuming app installing it. See
 * examples/paypal-consumer for the cross-package discovery half of this
 * pair (ADR 0014). This file verifies every generated artifact
 * byte-for-byte matches its `expected/` golden copy -- no `docs/OWNERSHIP.md`,
 * since this package's own generate script never requests a `usage` pass.
 * No runtime (`npm start`) assertion here: that's paypal-consumer's job,
 * since paypal-addon is a library, not an app with its own entry point.
 */
const EXAMPLE = "paypal-addon";
const ARTIFACTS = ["src/generated/env.manifest.ts", "src/generated/env.manifest.snapshot.json", "docs/ENVIRONMENT.md", ".env.example"];
const installed = isInstalled(EXAMPLE);

describe(EXAMPLE, () => {
  it.skipIf(!installed)("generated artifacts match their golden expected/ copies", async () => {
    runScript(EXAMPLE, "generate:env");
    await compareGoldenArtifacts(EXAMPLE, ARTIFACTS);
  });
});
