import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * `env-cap init` and `env-cap --help` never load `../build/index.js`, which
 * loads the TypeScript compiler. So they work even when that module cannot
 * load. Only the generate and check paths import it, through a dynamic
 * `import()`. Each test mocks the module to throw and asserts which commands
 * still succeed.
 *
 * Isolated into its own file (as test/cli/direct-run.test.ts is) so
 * `vi.resetModules()` and the mocked `../build/index.js` never interfere with
 * the static `import { main }` bindings the rest of the CLI tests use.
 */

const originalArgv = process.argv

afterEach(async () => {
  process.argv = originalArgv
  process.exitCode = undefined
  vi.restoreAllMocks()
  vi.doUnmock("../../src/build/index.js")
  vi.resetModules()
})

describe("CLI init/--help never load ../build/index.js (typescript optional-peer regression)", () => {
  it("`env-cap init` succeeds even when ../build/index.js throws on import", async () => {
    vi.doMock("../../src/build/index.js", () => {
      throw new Error(
        "../build/index.js must never be imported for `env-cap init` -- this simulates a missing optional `typescript` peer dependency",
      )
    })

    const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "env-cap-init-no-ts-"))
    try {
      await fs.writeFile(path.join(fixtureRoot, "package.json"), '{"name": "demo"}')
      vi.spyOn(process, "cwd").mockReturnValue(fixtureRoot)
      const writes: string[] = []
      vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
        writes.push(String(chunk))
        return true
      })

      vi.resetModules()
      const { main } = await import("../../src/cli/index.js")
      process.argv = ["node", "env-cap", "init"]

      await expect(main()).resolves.toBeUndefined()

      expect(process.exitCode).toBe(0)
      expect(writes.join("")).toContain("env-cap initialized")
      await expect(fs.access(path.join(fixtureRoot, "env.schema.ts"))).resolves.toBeUndefined()
    } finally {
      await fs.rm(fixtureRoot, { recursive: true, force: true })
    }
  })

  it("`env-cap --help` succeeds even when ../build/index.js throws on import", async () => {
    vi.doMock("../../src/build/index.js", () => {
      throw new Error(
        "../build/index.js must never be imported for `env-cap --help` -- this simulates a missing optional `typescript` peer dependency",
      )
    })

    const writes: string[] = []
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk))
      return true
    })

    vi.resetModules()
    const { main } = await import("../../src/cli/index.js")
    process.argv = ["node", "env-cap", "--help"]

    await expect(main()).resolves.toBeUndefined()

    expect(process.exitCode).toBe(0)
    expect(writes.join("")).toContain(
      "env-cap: from your env.schema.ts contracts, write the manifest",
    )
  })

  it("sanity check: a real generate run DOES load ../build/index.js (proves the mock above is meaningful, not a false pass)", async () => {
    // A throwing vi.doMock factory surfaces through vitest's own module-mock
    // error wrapper rather than the original error message verbatim: the
    // meaningful assertion is that main() rejects at all here (proving
    // ../build/index.js's mocked factory actually ran), unlike the init/
    // --help cases above, which resolve cleanly against the very same mock.
    vi.doMock("../../src/build/index.js", () => {
      throw new Error("boom -- ../build/index.js was loaded, as expected for a real generate run")
    })

    vi.resetModules()
    const { main } = await import("../../src/cli/index.js")
    process.argv = ["node", "env-cap", "--location", "out/env.manifest.ts"]

    await expect(main()).rejects.toThrow()
  })
})
