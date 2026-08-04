import { realpathSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { directRunUrl, parseArgs } from "../../src/cli/index.js"

describe("parseArgs", () => {
  it("parses --location with no other flags", () => {
    const args = parseArgs(["--location", "src/generated/env.manifest.ts"])
    expect(args.location).toBe("src/generated/env.manifest.ts")
    expect(args.help).toBe(false)
    expect(args.strict).toBe(false)
    expect(args.strictDocs).toBe(false)
    expect(args.strictOwnership).toBe(false)
    expect(args.expiringWithinDays).toBeUndefined()
    expect(args.include).toEqual([])
    expect(args.exclude).toEqual([])
  })

  it("parses --root, --docs, and --env-example", () => {
    const args = parseArgs([
      "--root",
      "/repo",
      "--location",
      "out.ts",
      "--docs",
      "docs/ENVIRONMENT.md",
      "--env-example",
      ".env.example",
    ])
    expect(args.root).toBe("/repo")
    expect(args.docs).toBe("docs/ENVIRONMENT.md")
    expect(args.envExample).toBe(".env.example")
  })

  it("parses --ownership", () => {
    const args = parseArgs(["--ownership", "docs/OWNERSHIP.md"])
    expect(args.ownership).toBe("docs/OWNERSHIP.md")
  })

  it("parses --env-example-on-existing with a valid mode", () => {
    expect(
      parseArgs(["--location", "out.ts", "--env-example-on-existing", "keep-sibling"])
        .envExampleOnExisting,
    ).toBe("keep-sibling")
    expect(
      parseArgs(["--location", "out.ts", "--env-example-on-existing", "overwrite"])
        .envExampleOnExisting,
    ).toBe("overwrite")
    expect(
      parseArgs(["--location", "out.ts", "--env-example-on-existing", "skip"]).envExampleOnExisting,
    ).toBe("skip")
  })

  it("leaves envExampleOnExisting undefined when the flag is omitted", () => {
    expect(parseArgs(["--location", "out.ts"]).envExampleOnExisting).toBeUndefined()
  })

  it("throws for an unknown --env-example-on-existing value", () => {
    expect(() => parseArgs(["--location", "out.ts", "--env-example-on-existing", "bogus"])).toThrow(
      /Unknown value for --env-example-on-existing/,
    )
  })

  it("collects repeatable --include and --exclude flags", () => {
    const args = parseArgs([
      "--location",
      "out.ts",
      "--include",
      "features/**/env.schema.ts",
      "--include",
      "packages/**/env.schema.ts",
      "--exclude",
      "**/fixtures/**",
    ])
    expect(args.include).toEqual(["features/**/env.schema.ts", "packages/**/env.schema.ts"])
    expect(args.exclude).toEqual(["**/fixtures/**"])
  })

  it("collects repeatable --package flags (ADR 0014)", () => {
    const args = parseArgs([
      "--location",
      "out.ts",
      "--package",
      "@acme/pkg-a",
      "--package",
      "@acme/pkg-b",
    ])
    expect(args.packages).toEqual(["@acme/pkg-a", "@acme/pkg-b"])
  })

  it("sets strict, strict-docs, strict-ownership, json, check, and help flags", () => {
    expect(parseArgs(["--location", "out.ts", "--strict"]).strict).toBe(true)
    expect(parseArgs(["--location", "out.ts", "--strict-docs"]).strictDocs).toBe(true)
    expect(parseArgs(["--ownership", "out.md", "--strict-ownership"]).strictOwnership).toBe(true)
    expect(parseArgs(["--location", "out.ts", "--json"]).json).toBe(true)
    expect(parseArgs(["--location", "out.ts"]).json).toBe(false)
    expect(parseArgs(["--location", "out.ts", "--check"]).check).toBe(true)
    expect(parseArgs(["--location", "out.ts"]).check).toBe(false)
    expect(parseArgs(["--help"]).help).toBe(true)
    expect(parseArgs(["-h"]).help).toBe(true)
  })

  it("parses --expiring-within-days as a number", () => {
    const args = parseArgs(["--location", "out.ts", "--expiring-within-days", "60"])
    expect(args.expiringWithinDays).toBe(60)
  })

  it("throws when --expiring-within-days is not a number", () => {
    expect(() => parseArgs(["--location", "out.ts", "--expiring-within-days", "soon"])).toThrow(
      /expects a number/,
    )
  })

  it("throws for an unknown argument", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown argument/)
  })

  it("throws when a value-taking flag is missing its value", () => {
    expect(() => parseArgs(["--location"])).toThrow(/requires a value/)
    expect(() => parseArgs(["--include"])).toThrow(/requires a value/)
    expect(() => parseArgs(["--ownership"])).toThrow(/requires a value/)
  })

  it("parses with none of --location/--docs/--ownership given -- parseArgs itself never enforces requiredness, main() does", () => {
    const args = parseArgs(["--strict"])
    expect(args.location).toBeUndefined()
    expect(args.docs).toBeUndefined()
    expect(args.ownership).toBeUndefined()
  })
})

// directRunUrl() is exported purely for this direct-unit-test path -- see the
// comment above its definition in src/cli/index.ts for why it exists at all
// (npm's `.bin` symlink indirection). module-level `isDirectRun`/auto-run
// behavior itself is exercised separately in test/cli/direct-run.test.ts,
// since re-executing this module's top level doesn't belong alongside the
// static `import { main }` bindings the rest of this suite relies on.
describe("directRunUrl", () => {
  const originalArgv1 = process.argv[1]

  afterEach(() => {
    process.argv[1] = originalArgv1
  })

  it("returns undefined when process.argv[1] is falsy", () => {
    process.argv[1] = ""
    expect(directRunUrl()).toBeUndefined()
  })

  it("resolves a real, symlink-free path via realpathSync", () => {
    const here = fileURLToPath(import.meta.url)
    process.argv[1] = here
    expect(directRunUrl()).toBe(pathToFileURL(realpathSync(here)).href)
  })

  it("falls back to the unresolved path when realpathSync throws (e.g. a nonexistent argv[1])", () => {
    const nonexistent = path.join(path.dirname(fileURLToPath(import.meta.url)), "does-not-exist.ts")
    process.argv[1] = nonexistent
    expect(directRunUrl()).toBe(pathToFileURL(nonexistent).href)
  })
})
