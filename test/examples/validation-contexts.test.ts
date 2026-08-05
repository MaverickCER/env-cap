import { describe, expect, it } from "vitest";
import { compareGoldenArtifacts, isInstalled, runScript } from "./support.js";

/**
 * validation-contexts demonstrates ADR 0022: one schema/manifest, three
 * variables (LOG_LEVEL has no context; DATABASE_URL is context: "server";
 * PUBLIC_API_URL is context: "client"), validated by two separate entry
 * points -- `example:server` and `example:client` -- each its own process,
 * each with a different activeContexts. This file verifies:
 *  - each script reads its own context's variable and the context-less one
 *  - each script's attempt to read the *other* context's variable throws
 *    EnvNotReadyError, printed rather than crashing the process
 *  - generate:env's artifacts (manifest, snapshot, docs, .env.example)
 *    byte-for-byte match their `expected/` golden copies, including the
 *    generated "Validation context: ..." annotations
 */
const EXAMPLE = "validation-contexts";
const ARTIFACTS = ["src/generated/env.manifest.ts", "src/generated/env.manifest.snapshot.json", "docs/ENVIRONMENT.md", ".env.example"];
const installed = isInstalled(EXAMPLE);

describe(EXAMPLE, () => {
  it.skipIf(!installed)("example:server validates with activeContexts: [\"server\"] and refuses the client-context variable", () => {
    const stdout = runScript(EXAMPLE, "example:server");
    expect(stdout).toContain('Validated with activeContexts: ["server"]');
    expect(stdout).toContain("LOG_LEVEL (no context, always participates): debug");
    expect(stdout).toContain('DATABASE_URL (context: "server", matches): postgres://');
    expect(stdout).toContain('PUBLIC_API_URL (context: "client", did not match) -- reading it throws:');
    expect(stdout).toContain("has not been validated yet");
  });

  it.skipIf(!installed)("example:client validates with activeContexts: [\"client\"] and refuses the server-context variable", () => {
    const stdout = runScript(EXAMPLE, "example:client");
    expect(stdout).toContain('Validated with activeContexts: ["client"]');
    expect(stdout).toContain("LOG_LEVEL (no context, always participates): debug");
    expect(stdout).toContain('PUBLIC_API_URL (context: "client", matches): https://');
    expect(stdout).toContain('DATABASE_URL (context: "server", did not match) -- reading it throws:');
    expect(stdout).toContain("has not been validated yet");
  });

  it.skipIf(!installed)(
    "generate:env's artifacts include the Validation context annotations and match their golden expected/ copies",
    async () => {
      const stdout = runScript(EXAMPLE, "generate:env");
      expect(stdout).toContain("Discovered 1 contract(s).");

      await compareGoldenArtifacts(EXAMPLE, ARTIFACTS);
    },
  );
});
