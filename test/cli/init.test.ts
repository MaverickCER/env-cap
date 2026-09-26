import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isFileExistsError, runInitCommand } from "../../src/cli/init.js"

// Node's native `fs` ESM bindings are non-configurable, so `vi.spyOn` can't
// install a spy directly on `writeFileSync` (`Cannot redefine property`).
// Mocking the module instead gives us a `vi.fn()`-wrapped `writeFileSync`
// that defaults to the real implementation, so every other test in this file
// (which just writes real fixture files) keeps working unmodified -- only a
// test that opts in via `mockImplementationOnce` sees different behavior,
// and only for that one call. Same established pattern as
// test/build/generate-env-artifacts.test.ts's `node:fs/promises` mock.
const { writeFileSyncMock } = vi.hoisted(() => ({ writeFileSyncMock: vi.fn() }))

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>()
  writeFileSyncMock.mockImplementation(actual.writeFileSync)
  return { ...actual, writeFileSync: writeFileSyncMock }
})

// `runInitCommand` reads `process.cwd()` and writes to stdout/stderr. Each
// test runs in a throwaway directory. Mocking `process.cwd()` itself, not
// a real `process.chdir()`: the latter throws `ERR_WORKER_UNSUPPORTED_OPERATION`
// under any worker-thread-based test runner (Stryker's own vitest-runner
// included, unlike this project's default `vitest run` pool) -- a Node.js
// platform restriction, not a vitest quirk -- confirmed directly (`npm run
// mutation` aborted its whole dry run on this file before this fix). Same
// technique this codebase's own test/build/usage-generate.test.ts (and
// siblings) already use for the identical reason.

let tmp: string
let out: string[]
let err: string[]

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "env-cap-init-"))
  vi.spyOn(process, "cwd").mockReturnValue(tmp)
  out = []
  err = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    out.push(String(chunk))
    return true
  })
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    err.push(String(chunk))
    return true
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(tmp, { recursive: true, force: true })
})

function writePackageJson(content = '{"name": "demo"}'): void {
  writeFileSync(path.join(tmp, "package.json"), content)
}

describe("runInitCommand", () => {
  it("scaffolds the starter schema and generator script, exit 0", () => {
    writePackageJson()

    const code = runInitCommand([])

    expect(code).toBe(0)
    expect(existsSync(path.join(tmp, "env.schema.ts"))).toBe(true)
    expect(existsSync(path.join(tmp, "scripts/generate-env.mjs"))).toBe(true)
    const report = out.join("")
    expect(report).toContain("Created:")
    expect(report).toContain("env.schema.ts")
    expect(report).toContain("scripts/generate-env.mjs")
    expect(report).toContain("Next:")
  })

  it("places the schema in src/ when src/ already exists", () => {
    writePackageJson()
    mkdirSync(path.join(tmp, "src"))

    runInitCommand([])

    expect(existsSync(path.join(tmp, "src/env.schema.ts"))).toBe(true)
    expect(existsSync(path.join(tmp, "env.schema.ts"))).toBe(false)
    expect(out.join("")).toContain("./generated/env.manifest.js")
  })

  it("creates the scripts/ directory when it does not exist yet", () => {
    writePackageJson()
    expect(existsSync(path.join(tmp, "scripts"))).toBe(false)

    runInitCommand([])

    expect(existsSync(path.join(tmp, "scripts/generate-env.mjs"))).toBe(true)
  })

  it("never overwrites an existing file -- reports it as skipped, exit 0", () => {
    writePackageJson()
    writeFileSync(path.join(tmp, "env.schema.ts"), "// mine\n")

    const code = runInitCommand([])

    expect(code).toBe(0)
    expect(readFileSync(path.join(tmp, "env.schema.ts"), "utf8")).toBe("// mine\n")
    const report = out.join("")
    expect(report).toContain("Skipped (already exists):")
    expect(report).toMatch(/Skipped \(already exists\):\n {2}- env\.schema\.ts/)
    // the other target was still created
    expect(existsSync(path.join(tmp, "scripts/generate-env.mjs"))).toBe(true)
  })

  it("fails with exit 1 and writes nothing when there is no package.json", () => {
    const code = runInitCommand([])

    expect(code).toBe(1)
    expect(err.join("")).toContain("npm init")
    expect(existsSync(path.join(tmp, "env.schema.ts"))).toBe(false)
    expect(existsSync(path.join(tmp, "scripts"))).toBe(false)
  })

  it("fails with exit 1 when package.json is not valid JSON", () => {
    writePackageJson("{ not json")

    const code = runInitCommand([])

    expect(code).toBe(1)
    expect(err.join("")).toContain("not valid JSON")
    expect(existsSync(path.join(tmp, "env.schema.ts"))).toBe(false)
  })

  it("fails with exit 1 when package.json is a JSON array, not an object", () => {
    writePackageJson("[]")

    expect(runInitCommand([])).toBe(1)
    expect(err.join("")).toContain("top-level object")
  })

  it("fails with exit 1 when package.json is valid JSON `null`", () => {
    // Isolates `parsed === null` from `typeof parsed !== "object"`: `typeof
    // null === "object"` in JS, so only the explicit `=== null` clause (not
    // the `typeof` check) catches this case.
    writePackageJson("null")

    expect(runInitCommand([])).toBe(1)
    expect(err.join("")).toContain("top-level object")
  })

  it("fails with exit 1 when package.json is a bare JSON number", () => {
    // Isolates `typeof parsed !== "object"` from the other two clauses:
    // neither `=== null` nor `Array.isArray` catches a primitive.
    writePackageJson("42")

    expect(runInitCommand([])).toBe(1)
    expect(err.join("")).toContain("top-level object")
  })

  it("fails with exit 1 and writes nothing when a scaffold target is blocked by a directory", () => {
    writePackageJson()
    mkdirSync(path.join(tmp, "env.schema.ts"))

    const code = runInitCommand([])

    expect(code).toBe(1)
    expect(err.join("")).toContain("already exists and is a directory")
    expect(existsSync(path.join(tmp, "scripts/generate-env.mjs"))).toBe(false)
  })

  it("--help prints usage and exits 0 without scaffolding", () => {
    writePackageJson()

    const code = runInitCommand(["--help"])

    expect(code).toBe(0)
    expect(out.join("")).toContain("Usage: env-cap init")
    expect(existsSync(path.join(tmp, "env.schema.ts"))).toBe(false)
  })

  it("-h prints usage and exits 0 without scaffolding", () => {
    // Isolates `rest.includes("-h")` from `rest.includes("--help")` --
    // `rest` here contains neither the literal string "--help" nor "".
    writePackageJson()

    const code = runInitCommand(["-h"])

    expect(code).toBe(0)
    expect(out.join("")).toContain("Usage: env-cap init")
    expect(existsSync(path.join(tmp, "env.schema.ts"))).toBe(false)
  })

  it("never writes 'Created:' when every target already exists", () => {
    // Isolates `created.length > 0` from an always-true guard and from a
    // `>= 0` off-by-one: with both targets pre-existing, `created` is empty
    // and the "Created:" section must be omitted entirely.
    writePackageJson()
    writeFileSync(path.join(tmp, "env.schema.ts"), "// mine\n")
    mkdirSync(path.join(tmp, "scripts"))
    writeFileSync(path.join(tmp, "scripts/generate-env.mjs"), "// mine too\n")

    const code = runInitCommand([])

    expect(code).toBe(0)
    const expected = [
      "env-cap initialized",
      "",
      "Skipped (already exists):",
      "  - env.schema.ts",
      `  - ${path.join("scripts", "generate-env.mjs")}`,
      "",
      "Next:",
      "  1. Generate the manifest + docs:  node scripts/generate-env.mjs",
      '     Requires "typescript" (>=5) in your project -- it\'s how env-cap parses',
      "     env.schema.ts by static analysis. Add it if you don't already have it:",
      "     npm install --save-dev typescript",
      "  2. Validate once at app startup:",
      "",
      '       import { validateEnv } from "@maverickcer/env-cap"',
      '       import { manifest } from "./src/generated/env.manifest.js"',
      "       await validateEnv({ manifest, values: process.env })",
      "",
      "  3. Read validated values through the contract:  exampleEnv.EXAMPLE_API_URL",
      "",
      "env-cap init edited no package.json script -- add one if you want, e.g.",
      '  "generate:env": "node scripts/generate-env.mjs"',
    ].join("\n")
    expect(out.join("")).toBe(`${expected}\n`)
    expect(out.join("")).not.toContain("Created:")
  })

  it("rejects extra arguments with exit 1", () => {
    writePackageJson()

    const code = runInitCommand(["--location", "x"])

    expect(code).toBe(1)
    expect(err.join("")).toContain("takes no arguments")
    expect(existsSync(path.join(tmp, "env.schema.ts"))).toBe(false)
  })

  // Exact `.toBe()` against the full rendered report kills every
  // StringLiteral mutant in `renderReport()`'s text in one shot -- any
  // character change breaks an exact match. Two scenarios together exercise
  // both the "Created" and "Skipped" blocks, and both branches of the
  // manifestImport ternary (root placement here; src/ placement below).
  it("renders the exact report when both targets are freshly created (root placement)", () => {
    writePackageJson()

    const code = runInitCommand([])

    expect(code).toBe(0)
    const expected = [
      "env-cap initialized",
      "",
      "Created:",
      "  + env.schema.ts",
      "  + scripts/generate-env.mjs",
      "",
      "Next:",
      "  1. Generate the manifest + docs:  node scripts/generate-env.mjs",
      '     Requires "typescript" (>=5) in your project -- it\'s how env-cap parses',
      "     env.schema.ts by static analysis. Add it if you don't already have it:",
      "     npm install --save-dev typescript",
      "  2. Validate once at app startup:",
      "",
      '       import { validateEnv } from "@maverickcer/env-cap"',
      '       import { manifest } from "./src/generated/env.manifest.js"',
      "       await validateEnv({ manifest, values: process.env })",
      "",
      "  3. Read validated values through the contract:  exampleEnv.EXAMPLE_API_URL",
      "",
      "env-cap init edited no package.json script -- add one if you want, e.g.",
      '  "generate:env": "node scripts/generate-env.mjs"',
    ].join("\n")
    expect(out.join("")).toBe(`${expected}\n`)
  })

  it("renders the exact report with one created and one skipped target (src/ placement)", () => {
    writePackageJson()
    mkdirSync(path.join(tmp, "src"))
    writeFileSync(path.join(tmp, "src/env.schema.ts"), "// mine\n")

    const code = runInitCommand([])

    expect(code).toBe(0)
    const expected = [
      "env-cap initialized",
      "",
      "Created:",
      "  + scripts/generate-env.mjs",
      "",
      "Skipped (already exists):",
      `  - ${path.join("src", "env.schema.ts")}`,
      "",
      "Next:",
      "  1. Generate the manifest + docs:  node scripts/generate-env.mjs",
      '     Requires "typescript" (>=5) in your project -- it\'s how env-cap parses',
      "     env.schema.ts by static analysis. Add it if you don't already have it:",
      "     npm install --save-dev typescript",
      "  2. Validate once at app startup:",
      "",
      '       import { validateEnv } from "@maverickcer/env-cap"',
      '       import { manifest } from "./generated/env.manifest.js"',
      "       await validateEnv({ manifest, values: process.env })",
      "",
      "  3. Read validated values through the contract:  exampleEnv.EXAMPLE_API_URL",
      "",
      "env-cap init edited no package.json script -- add one if you want, e.g.",
      '  "generate:env": "node scripts/generate-env.mjs"',
    ].join("\n")
    expect(out.join("")).toBe(`${expected}\n`)
  })

  it("--help prints the exact usage text", () => {
    writePackageJson()

    const code = runInitCommand(["--help"])

    expect(code).toBe(0)
    const expected = [
      "Usage: env-cap init",
      "",
      "Scaffolds a minimal env-cap starting point into the current directory:",
      "",
      "  <src>/env.schema.ts     a starter capability contract (createEnv + documentEnv)",
      "  scripts/generate-env.mjs a script that generates the manifest + docs artifacts",
      "",
      "Never overwrites an existing file, never runs anything, never edits",
      "package.json. Everything else -- generating artifacts, wiring validateEnv()",
      "into startup -- is printed as a next step. Run generation afterwards with",
      "`node scripts/generate-env.mjs` or `npx env-cap --location <path>`.",
    ].join("\n")
    expect(out.join("")).toBe(`${expected}\n`)
  })

  it("rejecting extra arguments prints the exact usage text after the error line", () => {
    writePackageJson()

    // Two args (not one) so `rest.join(" ")` is distinguishable from a
    // mutated `rest.join("")` -- a single-element array joins identically
    // either way.
    const code = runInitCommand(["--bogus", "value"])

    expect(code).toBe(1)
    const expectedUsage = [
      "Usage: env-cap init",
      "",
      "Scaffolds a minimal env-cap starting point into the current directory:",
      "",
      "  <src>/env.schema.ts     a starter capability contract (createEnv + documentEnv)",
      "  scripts/generate-env.mjs a script that generates the manifest + docs artifacts",
      "",
      "Never overwrites an existing file, never runs anything, never edits",
      "package.json. Everything else -- generating artifacts, wiring validateEnv()",
      "into startup -- is printed as a next step. Run generation afterwards with",
      "`node scripts/generate-env.mjs` or `npx env-cap --location <path>`.",
    ].join("\n")
    expect(err.join("")).toBe(
      `env-cap init takes no arguments (got: --bogus value)\n\n${expectedUsage}\n`,
    )
  })

  it("writes the exact starter schema template content", () => {
    writePackageJson()

    runInitCommand([])

    const expected = [
      "// Starter env-cap capability contract -- expand it: add your real variables,",
      "// split into per-capability files (e.g. features/<name>/env.schema.ts), or",
      "// keep everything here. env-cap discovers every **/env.schema.ts by default.",
      "//",
      "// createEnv() reads only default/processor/validator/context -- the fields",
      "// validateEnv() uses at runtime. documentEnv() is a build-time-only marker",
      "// that feeds the generated docs and ownership report; it is inert at runtime.",
      "// Keep the object passed to both a static literal -- env-cap resolves it by",
      "// static analysis and never executes this file.",
      'import { createEnv, documentEnv } from "@maverickcer/env-cap"',
      "",
      "const schema = {",
      "  EXAMPLE_API_URL: {",
      '    processor: (value: unknown): string => String(value ?? ""),',
      '    validator: (value: string) => value.startsWith("https://") || "Expected an https:// URL.",',
      "  },",
      "}",
      "",
      'export const exampleEnv = createEnv(schema, { name: "example", source: import.meta.url })',
      "",
      "documentEnv(schema, {",
      '  owner: "your-team",',
      "  variables: {",
      "    EXAMPLE_API_URL: {",
      '      description: "Base URL for the example upstream API. Replace with a real variable.",',
      "      required: true,",
      "    },",
      "  },",
      "})",
      "",
    ].join("\n")
    expect(readFileSync(path.join(tmp, "env.schema.ts"), "utf8")).toBe(expected)
  })

  it("writes the exact generator script template content", () => {
    writePackageJson()

    runInitCommand([])

    const expected = [
      "// Build-time only. Run with `node scripts/generate-env.mjs`, or wire it into",
      '// a package.json script (e.g. "generate:env"). Never imported by app code.',
      'import { generateEnvArtifacts } from "@maverickcer/env-cap/build"',
      'import { nodeBuildFileSystem } from "@maverickcer/env-cap/node"',
      'import path from "node:path"',
      'import { fileURLToPath } from "node:url"',
      "",
      'const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")',
      "",
      "const result = await generateEnvArtifacts({",
      "  fs: nodeBuildFileSystem,",
      "  root,",
      '  manifest: { location: "src/generated/env.manifest.ts" },',
      "  docs: {",
      '    location: "docs/ENVIRONMENT.md",',
      '    envExample: { location: ".env.example", onExisting: "keep-sibling" },',
      "  },",
      '  usage: { report: { location: "docs/OWNERSHIP.md" } },',
      "})",
      "",
      "console.log(`Discovered ${result.manifest?.contracts.length ?? 0} contract(s).`)",
      "if (result.manifest?.outputPath) console.log(`Wrote manifest: ${result.manifest.outputPath}`)",
      "if (result.docs?.docsPath) console.log(`Wrote docs: ${result.docs.docsPath}`)",
      "",
    ].join("\n")
    expect(readFileSync(path.join(tmp, "scripts/generate-env.mjs"), "utf8")).toBe(expected)
  })

  it("fails with exit 1 and writes nothing when the generator script path is blocked by a directory", () => {
    writePackageJson()
    mkdirSync(path.join(tmp, "scripts", "generate-env.mjs"), { recursive: true })

    const code = runInitCommand([])

    expect(code).toBe(1)
    expect(err.join("")).toContain("already exists and is a directory")
    expect(existsSync(path.join(tmp, "env.schema.ts"))).toBe(false)
  })

  it("fails with exit 1 and writes nothing when scripts/ exists but is not a directory", () => {
    writePackageJson()
    writeFileSync(path.join(tmp, "scripts"), "not a directory\n")

    const code = runInitCommand([])

    expect(code).toBe(1)
    expect(err.join("")).toContain("already exists and is not a directory")
    expect(existsSync(path.join(tmp, "env.schema.ts"))).toBe(false)
  })

  it("fails with exit 1 and reports the underlying error when writing hits a non-EEXIST failure", () => {
    writePackageJson()
    const writeError = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" })
    writeFileSyncMock.mockImplementationOnce(() => {
      throw writeError
    })

    const code = runInitCommand([])

    expect(code).toBe(1)
    expect(err.join("")).toBe("env-cap init failed: EACCES: permission denied\n")
  })

  it("fails with exit 1 and reports a stringified non-Error thrown during write", () => {
    writePackageJson()
    writeFileSyncMock.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately exercising the `error instanceof Error ? ... : String(error)` fallback branch.
      throw "boom"
    })

    const code = runInitCommand([])

    expect(code).toBe(1)
    expect(err.join("")).toBe("env-cap init failed: boom\n")
  })
})

describe("isFileExistsError", () => {
  it("is true for an EEXIST error", () => {
    expect(isFileExistsError({ code: "EEXIST" })).toBe(true)
  })

  it("is false for a different error code", () => {
    expect(isFileExistsError({ code: "ENOENT" })).toBe(false)
  })

  it("is false for an object with no code property", () => {
    expect(isFileExistsError({})).toBe(false)
  })

  it("is false for null", () => {
    expect(isFileExistsError(null)).toBe(false)
  })

  it("is false for undefined", () => {
    expect(isFileExistsError(undefined)).toBe(false)
  })

  it("is false for a non-object value", () => {
    expect(isFileExistsError("EEXIST")).toBe(false)
  })

  it("is false for a real EEXIST-coded Error instance's exact type but different code", () => {
    expect(isFileExistsError(Object.assign(new Error("x"), { code: "EPERM" }))).toBe(false)
  })
})
