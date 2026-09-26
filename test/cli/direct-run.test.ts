import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * Exercises the module-level `if (isDirectRun) { main().catch(...) }` guard
 * at the bottom of src/cli/index.ts -- the only way to hit it from vitest is
 * to make a *fresh* import of the module see `process.argv[1]` equal to its
 * own real (symlink-free) on-disk path before the module's top level runs,
 * since `isDirectRun` is computed once, at import time. Isolated into its own
 * file so `vi.resetModules()` + a dynamic re-import never interferes with the
 * static `import { main }` bindings the rest of the cli test suite relies on.
 *
 * An unknown flag makes `parseArgs()` throw synchronously inside `main()`,
 * so `main().catch()` fires almost immediately -- fast and deterministic,
 * no real generation work involved.
 */

const cliEntryPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/cli/index.ts",
)

const originalArgv = process.argv

afterEach(() => {
  process.argv = originalArgv
  process.exitCode = undefined
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("module auto-run guard (isDirectRun)", () => {
  it("runs main() and reports the error via main().catch() when this module is the process entry point", async () => {
    process.argv = ["node", cliEntryPath, "--this-flag-does-not-exist"]

    const stderrWrites: string[] = []
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      stderrWrites.push(String(chunk))
      return true
    })

    vi.resetModules()
    await import("../../src/cli/index.js")

    // `vi.waitFor`'s own default poll timeout (1000ms) is an independent
    // clock from this file's `testTimeout` (vitest.config.ts, 20_000ms) --
    // raised globally specifically because spawned/dynamically-imported work
    // routinely clears Vitest's short defaults in isolation but blows past
    // them under full-suite parallel resource contention. Left at its
    // default, this inner poll silently reintroduces exactly the short
    // ceiling that global setting exists to avoid, and fails under the same
    // contention testTimeout was raised to tolerate. Match it to that
    // already-justified budget instead of guessing a new number.
    await vi.waitFor(() => {
      expect(stderrWrites.join("")).toContain("Unknown argument")
    }, 15_000)

    expect(process.exitCode).toBe(1)
  })

  it("never auto-runs when argv[1] is not this module's own path (a plain import)", async () => {
    process.argv = ["node", "/some/unrelated/entry-point.js", "--this-flag-does-not-exist"]

    const stderrWrites: string[] = []
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      stderrWrites.push(String(chunk))
      return true
    })

    vi.resetModules()
    await import("../../src/cli/index.js")

    // Give any (wrongly-)scheduled main().catch() a chance to run, so a
    // regression here fails instead of racing past a false negative.
    await new Promise((resolve) => setImmediate(resolve))

    expect(stderrWrites.join("")).toBe("")
    expect(process.exitCode).toBeUndefined()
  })

  it("stringifies a non-Error rejection value via String(error), not error.message", async () => {
    // Every real throw inside src/cli/index.ts is a genuine Error instance --
    // to reach the `String(error)` side of the catch handler's ternary at
    // all, generateEnvArtifacts() itself has to be the one to reject with a
    // non-Error value, which only a mock can force.
    process.argv = ["node", cliEntryPath, "--location", "out.ts"]

    vi.doMock("../../src/build/generate-env-artifacts.js", () => ({
      generateEnvArtifacts: vi.fn().mockRejectedValue("boom -- not an Error instance"),
    }))

    const stderrWrites: string[] = []
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      stderrWrites.push(String(chunk))
      return true
    })

    try {
      vi.resetModules()
      await import("../../src/cli/index.js")

      // Same reasoning as the sibling `vi.waitFor` above: this path also
      // dynamically re-imports the real (unmocked) `../build/index.js`
      // barrel fresh on every run (`vi.resetModules()` defeats the module
      // cache), which is real, variable-cost work -- match the poll window
      // to this file's already-justified `testTimeout` budget instead of
      // the unrelated 1000ms default.
      await vi.waitFor(() => {
        expect(stderrWrites.join("")).toContain("boom -- not an Error instance")
      }, 15_000)

      expect(process.exitCode).toBe(1)
    } finally {
      vi.doUnmock("../../src/build/generate-env-artifacts.js")
    }
  })
})
