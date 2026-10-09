import { describe, expect, it, vi } from "vitest"
import { generateEnvArtifacts } from "../../src/build/generate-env-artifacts.js"
import { createInMemoryBuildFs } from "../support/build-filesystem.js"

// A TypeScript 7 `typescript` with the bundled TypeScript 6 stripped from the install: the loader
// hands back a module with no classic API, which is the only way the scanner can fail to start.
vi.mock("../../src/build/typescript.js", () => ({ ts: { version: "7.0.2" } }))

describe("a build with no usable compiler", () => {
  it("fails with the readable compiler error before it writes anything", async () => {
    const fs = createInMemoryBuildFs({
      "/repo/features/payments/env.schema.ts":
        'export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });',
    })
    const before = fs.paths()

    await expect(
      generateEnvArtifacts({
        fs,
        root: "/repo",
        manifest: { location: "env.manifest.ts" },
        docs: { location: "docs" },
        usage: false,
      }),
    ).rejects.toThrow(
      /typescript 7\.0\.2 does not expose it and the bundled @typescript\/typescript6/,
    )

    expect(fs.paths()).toEqual(before)
  })
})
