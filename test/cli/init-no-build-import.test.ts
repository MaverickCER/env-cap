import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * Regression test for a real, hands-on-verified bug: `env-cap init` and
 * `env-cap --help` used to fail on a completely fresh install with
 * `ERR_MODULE_NOT_FOUND: Cannot find package 'typescript'`, because
 * src/cli/index.ts had a static top-level `import { checkEnvArtifacts,
 * generateEnvArtifacts } from "../build/index.js"` -- evaluated eagerly for
 * EVERY invocation of the CLI, even though `../build/index.js` (indirectly)
 * imports `typescript`, and `typescript` is only an optional peer dependency
 * (README: "TypeScript 5+ is only required for build-time manifest
 * generation"). `env-cap init` itself is pure `node:fs` (ADR 0042) and never
 * needed `../build/index.js` at all.
 *
 * Reproduced by hand: `npm pack` a real build, install it into a scratch
 * project with no `typescript` anywhere in its dependency tree, and run
 * `npx env-cap init` -- it threw before `runInitCommand` ever ran. Fixed by
 * making `../build/index.js` a type-only import at module scope, loaded via
 * a dynamic `import()` inside `runCheckMode`/`runGenerateMode` only -- the
 * two code paths that actually need it.
 *
 * Isolated into its own file (matching test/cli/direct-run.test.ts's own
 * comment on why) so `vi.resetModules()` + a mocked `../build/index.js`
 * never interferes with the static `import { main }` bindings the rest of
 * the CLI test suite relies on.
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
    expect(writes.join("")).toContain("env-cap - generate a manifest")
  })

  it("sanity check: a real generate run DOES load ../build/index.js (proves the mock above is meaningful, not a false pass)", async () => {
    // A throwing vi.doMock factory surfaces through vitest's own module-mock
    // error wrapper rather than the original error message verbatim -- the
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
