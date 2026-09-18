import { nodeBuildFs } from "../../support/build-filesystem.js"
import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { BuildFileSystem } from "../../../src/build/types.js"
import {
  MAX_PACKAGE_SCHEMA_FILE_BYTES,
  mergeLocalAndPackageFiles,
  resolveAllowlistedPackages,
  resolvePackageImport,
  resolvePackageSchemaFile,
  type PackageSchemaResolutionResult,
} from "../../../src/build/resolution/resolve-package-schema.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(here, "fixtures-resolve-package-schema")

async function writeJson(relativePath: string, value: unknown): Promise<void> {
  const filePath = path.join(fixtureRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8")
}

async function writeFile(relativePath: string, content: string): Promise<string> {
  const filePath = path.join(fixtureRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf8")
  return filePath
}

function freshCache(): Map<string, Promise<PackageSchemaResolutionResult>> {
  return new Map()
}

/**
 * `nodeBuildFs` with one or more methods replaced -- the injectable
 * alternative to `vi.spyOn(fs, ...)` (ADR 0040: this code takes its
 * filesystem as a capability, so a test forcing an error path swaps the
 * capability instead of mocking the global `node:fs/promises` module).
 * Every un-overridden method still hits the real fixture tree, since the
 * resolution these tests exercise also relies on Node's own
 * `createRequire().resolve()` seeing a real, installed package on disk.
 */
function fsWithOverride(overrides: Partial<BuildFileSystem>): BuildFileSystem {
  return { ...nodeBuildFs, ...overrides }
}

beforeAll(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
  await writeJson("package.json", { name: "fixture-root", private: true })

  // A normal, well-behaved package: no "exports" map (so the fast
  // "<pkg>/package.json" resolution path succeeds), declares a valid schema.
  await writeJson("node_modules/@fixtures/simple-pkg/package.json", {
    name: "@fixtures/simple-pkg",
    main: "./dist/index.js",
    envCap: { schema: "./src/env.schema.ts" },
  })
  await writeFile("node_modules/@fixtures/simple-pkg/dist/index.js", "module.exports = {};\n")
  await writeFile(
    "node_modules/@fixtures/simple-pkg/src/env.schema.ts",
    `import { createEnv } from "env-cap";\nexport const simpleEnv = createEnv({ A: {} }, { name: "simple" });\n`,
  )

  // No "envCap" field at all.
  await writeJson("node_modules/@fixtures/no-schema/package.json", {
    name: "@fixtures/no-schema",
    main: "./index.js",
  })
  await writeFile("node_modules/@fixtures/no-schema/index.js", "module.exports = {};\n")

  // "envCap.schema" points at compiled output, not .ts/.tsx.
  await writeJson("node_modules/@fixtures/wrong-ext/package.json", {
    name: "@fixtures/wrong-ext",
    main: "./index.js",
    envCap: { schema: "./dist/env.schema.js" },
  })
  await writeFile("node_modules/@fixtures/wrong-ext/index.js", "module.exports = {};\n")
  await writeFile("node_modules/@fixtures/wrong-ext/dist/env.schema.js", "module.exports = {};\n")

  // "envCap.schema" lexically escapes the package directory.
  await writeJson("node_modules/@fixtures/escape-lexical/package.json", {
    name: "@fixtures/escape-lexical",
    main: "./index.js",
    envCap: { schema: "../../../outside.ts" },
  })
  await writeFile("node_modules/@fixtures/escape-lexical/index.js", "module.exports = {};\n")
  await writeFile("outside.ts", "export const shouldNeverBeRead = true;\n")

  // "envCap.schema" is a symlink whose real target escapes the package
  // directory -- must be rejected even though the declared path *string*
  // never contains "..".
  await writeFile("escape-target/secret.ts", "export const shouldNeverBeRead = true;\n")
  await writeJson("node_modules/@fixtures/escape-symlink/package.json", {
    name: "@fixtures/escape-symlink",
    main: "./index.js",
    envCap: { schema: "./src/env.schema.ts" },
  })
  await writeFile("node_modules/@fixtures/escape-symlink/index.js", "module.exports = {};\n")
  await fs.mkdir(path.join(fixtureRoot, "node_modules/@fixtures/escape-symlink/src"), {
    recursive: true,
  })
  await fs.symlink(
    path.join(fixtureRoot, "escape-target/secret.ts"),
    path.join(fixtureRoot, "node_modules/@fixtures/escape-symlink/src/env.schema.ts"),
  )

  // "envCap.schema" is a symlink whose real target stays *inside* the
  // package directory -- must be allowed (symlinks aren't rejected on
  // sight; only an escaping real target is).
  await writeJson("node_modules/@fixtures/safe-symlink/package.json", {
    name: "@fixtures/safe-symlink",
    main: "./index.js",
    envCap: { schema: "./src/env.schema.ts" },
  })
  await writeFile("node_modules/@fixtures/safe-symlink/index.js", "module.exports = {};\n")
  await writeFile(
    "node_modules/@fixtures/safe-symlink/src/real.ts",
    'export const realOne = createEnv({}, { name: "x" });\n',
  )
  await fs.symlink(
    path.join(fixtureRoot, "node_modules/@fixtures/safe-symlink/src/real.ts"),
    path.join(fixtureRoot, "node_modules/@fixtures/safe-symlink/src/env.schema.ts"),
  )

  // Oversized schema file.
  await writeJson("node_modules/@fixtures/too-big/package.json", {
    name: "@fixtures/too-big",
    main: "./index.js",
    envCap: { schema: "./src/env.schema.ts" },
  })
  await writeFile("node_modules/@fixtures/too-big/index.js", "module.exports = {};\n")
  await writeFile(
    "node_modules/@fixtures/too-big/src/env.schema.ts",
    "x".repeat(MAX_PACKAGE_SCHEMA_FILE_BYTES + 1),
  )

  // Schema file exactly at the size cap -- must still be allowed (the cap is
  // "exceeding", not "at or exceeding").
  await writeJson("node_modules/@fixtures/exactly-at-cap/package.json", {
    name: "@fixtures/exactly-at-cap",
    main: "./index.js",
    envCap: { schema: "./src/env.schema.ts" },
  })
  await writeFile("node_modules/@fixtures/exactly-at-cap/index.js", "module.exports = {};\n")
  await writeFile(
    "node_modules/@fixtures/exactly-at-cap/src/env.schema.ts",
    "x".repeat(MAX_PACKAGE_SCHEMA_FILE_BYTES),
  )

  // "envCap.schema" is present but not a string (a number here) -- must be
  // rejected the same as a wholly-absent field.
  await writeJson("node_modules/@fixtures/non-string-schema/package.json", {
    name: "@fixtures/non-string-schema",
    main: "./index.js",
    envCap: { schema: 42 },
  })
  await writeFile("node_modules/@fixtures/non-string-schema/index.js", "module.exports = {};\n")

  // Decoy nested package.json (no "name" field) between the main entry and
  // the real root package.json -- the upward walk must not stop there. Only
  // reachable via the fallback path, so "exports" must omit "./package.json".
  await writeJson("node_modules/@fixtures/decoy-walk/package.json", {
    name: "@fixtures/decoy-walk",
    exports: { ".": "./dist/nested/index.js" },
    envCap: { schema: "./src/env.schema.ts" },
  })
  await writeJson("node_modules/@fixtures/decoy-walk/dist/nested/package.json", {
    type: "commonjs",
  })
  await writeFile(
    "node_modules/@fixtures/decoy-walk/dist/nested/index.js",
    "module.exports = {};\n",
  )
  await writeFile(
    "node_modules/@fixtures/decoy-walk/src/env.schema.ts",
    `export const decoyEnv = createEnv({}, { name: "decoy" });\n`,
  )

  // Main entry nested deep enough (more than PACKAGE_JSON_ANCESTOR_SEARCH_LIMIT
  // levels) below the package's own package.json that the upward walk
  // exhausts its iteration budget before ever reaching it -- must return
  // undefined (PACKAGE_NOT_FOUND) rather than loop forever or crash.
  await writeJson("node_modules/@fixtures/deep-nomatch/package.json", {
    name: "@fixtures/deep-nomatch",
    exports: { ".": "./a/b/c/d/e/f/g/h/index.js" },
    envCap: { schema: "./src/env.schema.ts" },
  })
  await writeFile(
    "node_modules/@fixtures/deep-nomatch/a/b/c/d/e/f/g/h/index.js",
    "module.exports = {};\n",
  )
  await writeFile(
    "node_modules/@fixtures/deep-nomatch/src/env.schema.ts",
    `export const deepEnv = createEnv({}, { name: "deep" });\n`,
  )

  // "envCap.schema" is lexically inside the package dir and has the right
  // extension, but nothing actually exists at that path on disk.
  await writeJson("node_modules/@fixtures/missing-file/package.json", {
    name: "@fixtures/missing-file",
    main: "./index.js",
    envCap: { schema: "./src/does-not-exist.ts" },
  })
  await writeFile("node_modules/@fixtures/missing-file/index.js", "module.exports = {};\n")

  // "envCap.schema" resolves (after realpath) to a real directory rather
  // than a regular file -- a directory can still be named with a ".ts"
  // suffix, so the extension check alone doesn't catch this.
  await writeJson("node_modules/@fixtures/schema-is-directory/package.json", {
    name: "@fixtures/schema-is-directory",
    main: "./index.js",
    envCap: { schema: "./src/env.schema.ts" },
  })
  await writeFile("node_modules/@fixtures/schema-is-directory/index.js", "module.exports = {};\n")
  await fs.mkdir(
    path.join(fixtureRoot, "node_modules/@fixtures/schema-is-directory/src/env.schema.ts"),
    { recursive: true },
  )

  // Package directory itself reached via a symlink (mimics pnpm's
  // content-addressable store) -- the declared schema file must still
  // resolve and pass the realpath containment check correctly.
  await writeJson(".store/symlinked-pkg-real/package.json", {
    name: "@fixtures/symlinked-pkg",
    main: "./index.js",
    envCap: { schema: "./src/env.schema.ts" },
  })
  await writeFile(".store/symlinked-pkg-real/index.js", "module.exports = {};\n")
  await writeFile(
    ".store/symlinked-pkg-real/src/env.schema.ts",
    `export const storeEnv = createEnv({}, { name: "store" });\n`,
  )
  await fs.mkdir(path.join(fixtureRoot, "node_modules/@fixtures"), { recursive: true })
  await fs.symlink(
    path.join(fixtureRoot, ".store/symlinked-pkg-real"),
    path.join(fixtureRoot, "node_modules/@fixtures/symlinked-pkg"),
  )

  // Second package for cross-package "cycle" scenario: bare-imports the
  // first from within its own schema file's surrounding module (the schema
  // file itself doesn't need to import anything for resolution purposes --
  // resolution is per-package-name and non-recursive by construction).
  await writeJson("node_modules/@fixtures/cycle-a/package.json", {
    name: "@fixtures/cycle-a",
    main: "./index.js",
    envCap: { schema: "./src/env.schema.ts" },
  })
  await writeFile("node_modules/@fixtures/cycle-a/index.js", "module.exports = {};\n")
  await writeFile(
    "node_modules/@fixtures/cycle-a/src/env.schema.ts",
    `export const aEnv = createEnv({}, { name: "a" });\n`,
  )
  await writeJson("node_modules/@fixtures/cycle-b/package.json", {
    name: "@fixtures/cycle-b",
    main: "./index.js",
    envCap: { schema: "./src/env.schema.ts" },
  })
  await writeFile("node_modules/@fixtures/cycle-b/index.js", "module.exports = {};\n")
  await writeFile(
    "node_modules/@fixtures/cycle-b/src/env.schema.ts",
    `export const bEnv = createEnv({}, { name: "b" });\n`,
  )
})

afterAll(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
})

describe("resolvePackageSchemaFile", () => {
  it("resolves a well-behaved package's declared schema file", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/simple-pkg",
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.origin.packageName).toBe("@fixtures/simple-pkg")
      expect(result.origin.declaredField).toBe("./src/env.schema.ts")
      expect(result.origin.resolvedFile.endsWith("src/env.schema.ts")).toBe(true)
    }
  })

  it("caches the resolution promise across calls, returning the identical promise instance for a repeat lookup", async () => {
    const cache = freshCache()
    const first = resolvePackageSchemaFile("@fixtures/simple-pkg", fixtureRoot, cache, nodeBuildFs)
    expect(first).toBeInstanceOf(Promise)
    const second = resolvePackageSchemaFile("@fixtures/simple-pkg", fixtureRoot, cache, nodeBuildFs)
    expect(second).toBe(first)
    const result = await first
    expect(result.ok).toBe(true)
  })

  it("reports PACKAGE_NOT_FOUND for a package that isn't installed", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/does-not-exist",
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result).toMatchObject({
      ok: false,
      code: "PACKAGE_NOT_FOUND",
      reason: `Package "@fixtures/does-not-exist" listed in "packages" could not be resolved from "${fixtureRoot}" -- is it installed?`,
    })
  })

  it("reports FIELD_MISSING when the package.json has no envCap.schema field", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/no-schema",
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result).toMatchObject({
      ok: false,
      code: "FIELD_MISSING",
      reason: `"@fixtures/no-schema"'s package.json has no "envCap.schema" field (or it is not a string).`,
    })
  })

  it("reports FIELD_MISSING when envCap.schema is present but not a string", async () => {
    // Distinguishes the `typeof envCapField.schema === "string"` check from
    // an unconditional pass-through -- a non-string schema value (present,
    // just the wrong type) must still be rejected exactly like an absent one.
    const result = await resolvePackageSchemaFile(
      "@fixtures/non-string-schema",
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result).toMatchObject({ ok: false, code: "FIELD_MISSING" })
  })

  it("reports INVALID_EXTENSION for a declared field pointing at compiled output", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/wrong-ext",
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result).toMatchObject({
      ok: false,
      code: "INVALID_EXTENSION",
      reason: `"@fixtures/wrong-ext"'s "envCap.schema" ("./dist/env.schema.js") must be a .ts/.tsx file, not compiled/bundled output.`,
    })
  })

  it("reports OUTSIDE_PACKAGE for a declared field that lexically escapes the package directory", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/escape-lexical",
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result).toMatchObject({
      ok: false,
      code: "OUTSIDE_PACKAGE",
      reason: `"@fixtures/escape-lexical"'s "envCap.schema" ("../../../outside.ts") resolves outside its own package directory.`,
    })
  })

  it("reports OUTSIDE_PACKAGE for a symlink whose real target escapes the package directory", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/escape-symlink",
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result).toMatchObject({
      ok: false,
      code: "OUTSIDE_PACKAGE",
      reason: `"@fixtures/escape-symlink"'s "envCap.schema" ("./src/env.schema.ts") resolves, after following symlinks, outside its own package directory.`,
    })
  })

  it("allows a symlink whose real target stays inside the package directory", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/safe-symlink",
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result.ok).toBe(true)
  })

  it("reports FILE_TOO_LARGE for a schema file exceeding the size cap", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/too-big",
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result).toMatchObject({
      ok: false,
      code: "FILE_TOO_LARGE",
      reason: `"@fixtures/too-big"'s "envCap.schema" ("./src/env.schema.ts") is ${MAX_PACKAGE_SCHEMA_FILE_BYTES + 1} bytes, exceeding the ${MAX_PACKAGE_SCHEMA_FILE_BYTES}-byte limit for a package-resolved schema file.`,
    })
  })

  it("allows a schema file exactly at the size cap -- distinguishes > from >=", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/exactly-at-cap",
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result.ok).toBe(true)
  })

  it("does not stop at a decoy nested package.json with no matching name during the upward walk", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/decoy-walk",
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.origin.resolvedFile.endsWith("decoy-walk/src/env.schema.ts")).toBe(true)
  })

  it("reports PACKAGE_NOT_FOUND when the upward walk exhausts its iteration budget without ever finding a matching package.json", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/deep-nomatch",
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result).toMatchObject({
      ok: false,
      code: "PACKAGE_NOT_FOUND",
      reason: `Package "@fixtures/deep-nomatch" listed in "packages" could not be resolved from "${fixtureRoot}" -- is it installed?`,
    })
  })

  it("reports PACKAGE_NOT_FOUND when the upward walk reaches the real filesystem root without ever finding a matching package.json", async () => {
    // A repo-nested fixture is always far more than
    // PACKAGE_JSON_ANCESTOR_SEARCH_LIMIT directory levels below the real "/",
    // so exercising the "walk reaches the actual root" outcome (as opposed to
    // "walk exhausts its iteration budget") needs its own, much shallower,
    // root outside the repo entirely.
    const rootWalkRoot = path.join("/tmp", `env-cap-rootwalk-${process.pid}-${Date.now()}`)
    const packageDir = path.join(rootWalkRoot, "node_modules/@fixtures/rootwalk")
    await fs.mkdir(packageDir, { recursive: true })
    // "exports" without "./package.json" forces the ancestor-walk fallback;
    // "name" deliberately does not match so the walk never stops early.
    await fs.writeFile(
      path.join(packageDir, "package.json"),
      JSON.stringify({ name: "@fixtures/rootwalk-not-a-match", exports: { ".": "./index.js" } }),
      "utf8",
    )
    await fs.writeFile(path.join(packageDir, "index.js"), "module.exports = {};\n", "utf8")
    try {
      const result = await resolvePackageSchemaFile(
        "@fixtures/rootwalk",
        rootWalkRoot,
        freshCache(),
        nodeBuildFs,
      )
      expect(result).toMatchObject({ ok: false, code: "PACKAGE_NOT_FOUND" })
    } finally {
      await fs.rm(rootWalkRoot, { recursive: true, force: true })
    }
  })

  it("reports MALFORMED_PACKAGE_JSON when the resolved package.json is not valid JSON", async () => {
    // Node's own module resolution needs to parse a package's package.json
    // just to locate anything inside it, so a package.json malformed enough
    // to reach this code's own JSON.parse can't be constructed as a package
    // Node itself can resolve at all -- override the read this code does
    // once it already has a resolved, Node-valid path in hand. Every OTHER
    // fixture in this file resolves via the real package.json on disk (see
    // `@fixtures/simple-pkg`'s own valid manifest), so an unconditional
    // override (not a "once") is safe: this resolution's own success path
    // calls `readFile` exactly once, for this exact manifest.
    const packageJsonPath = path.join(fixtureRoot, "node_modules/@fixtures/simple-pkg/package.json")
    const result = await resolvePackageSchemaFile(
      "@fixtures/simple-pkg",
      fixtureRoot,
      freshCache(),
      fsWithOverride({ readFile: async () => "{ this is not json" }),
    )
    expect(result).toMatchObject({
      ok: false,
      code: "MALFORMED_PACKAGE_JSON",
      reason: `"${packageJsonPath}" is not valid JSON.`,
    })
  })

  it("reports MALFORMED_PACKAGE_JSON when the resolved package.json parses to something other than a JSON object", async () => {
    // A bare JSON string, not `[]` -- isRecord()'s own `typeof value ===
    // "object"` check does not exclude arrays, so this is the shape that
    // actually exercises the "not a JSON object" rejection.
    const packageJsonPath = path.join(fixtureRoot, "node_modules/@fixtures/simple-pkg/package.json")
    const result = await resolvePackageSchemaFile(
      "@fixtures/simple-pkg",
      fixtureRoot,
      freshCache(),
      fsWithOverride({ readFile: async () => '"just a string"' }),
    )
    expect(result).toMatchObject({
      ok: false,
      code: "MALFORMED_PACKAGE_JSON",
      reason: `"${packageJsonPath}" does not contain a JSON object.`,
    })
  })

  it("reports MALFORMED_PACKAGE_JSON when the resolved package.json parses to null -- typeof null === 'object' too, isRecord's own null check must be doing real work", async () => {
    const packageJsonPath = path.join(fixtureRoot, "node_modules/@fixtures/simple-pkg/package.json")
    const result = await resolvePackageSchemaFile(
      "@fixtures/simple-pkg",
      fixtureRoot,
      freshCache(),
      fsWithOverride({ readFile: async () => "null" }),
    )
    expect(result).toMatchObject({
      ok: false,
      code: "MALFORMED_PACKAGE_JSON",
      reason: `"${packageJsonPath}" does not contain a JSON object.`,
    })
  })

  it("reports OUTSIDE_PACKAGE when the declared field doesn't resolve to anything that exists on disk", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/missing-file",
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result).toMatchObject({
      ok: false,
      code: "OUTSIDE_PACKAGE",
      reason: `"@fixtures/missing-file"'s "envCap.schema" ("./src/does-not-exist.ts") does not resolve to a file that exists.`,
    })
  })

  it("reports OUTSIDE_PACKAGE when the declared field resolves to a directory rather than a regular file", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/schema-is-directory",
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result).toMatchObject({
      ok: false,
      code: "OUTSIDE_PACKAGE",
      reason: `"@fixtures/schema-is-directory"'s "envCap.schema" ("./src/env.schema.ts") does not resolve to a regular file.`,
    })
  })

  it("reports OUTSIDE_PACKAGE when fs.stat throws for the already-realpath'd file", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/simple-pkg",
      fixtureRoot,
      freshCache(),
      fsWithOverride({
        stat: async () => {
          throw new Error("ENOENT: simulated vanish between realpath and stat")
        },
      }),
    )
    expect(result).toMatchObject({
      ok: false,
      code: "OUTSIDE_PACKAGE",
      reason: `"@fixtures/simple-pkg"'s "envCap.schema" ("./src/env.schema.ts") could not be read.`,
    })
  })

  it("resolves correctly when the package directory itself is reached via a symlink (pnpm-style store)", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/symlinked-pkg",
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.origin.resolvedFile.endsWith("symlinked-pkg-real/src/env.schema.ts")).toBe(true)
  })

  it("never calls fs.readdir -- resolution is bounded, not a directory treewalk", async () => {
    let readdirCalled = false
    const trackedFs = fsWithOverride({
      readdir: (...args: Parameters<BuildFileSystem["readdir"]>) => {
        readdirCalled = true
        return nodeBuildFs.readdir(...args)
      },
    })
    await resolvePackageSchemaFile("@fixtures/decoy-walk", fixtureRoot, freshCache(), trackedFs)
    await resolvePackageSchemaFile("@fixtures/simple-pkg", fixtureRoot, freshCache(), trackedFs)
    expect(readdirCalled).toBe(false)
  })

  it("memoizes: a second call for the same package name and cache reuses the SAME in-flight Promise, not a fresh resolution", async () => {
    const cache = freshCache()
    const first = resolvePackageSchemaFile("@fixtures/simple-pkg", fixtureRoot, cache, nodeBuildFs)
    const second = resolvePackageSchemaFile("@fixtures/simple-pkg", fixtureRoot, cache, nodeBuildFs)
    expect(second).toBe(first)
    await first
  })
})

describe("resolveAllowlistedPackages", () => {
  it("deduplicates a package name listed more than once into a single resolution and a single warning", async () => {
    const cache = freshCache()
    const result = await resolveAllowlistedPackages(
      ["@fixtures/no-schema", "@fixtures/no-schema"],
      fixtureRoot,
      cache,
      nodeBuildFs,
    )
    expect(result.files).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]?.file).toBe("(package) @fixtures/no-schema")
  })

  it("resolves two independent, mutually-unrelated packages without recursion or cross-contamination (cycle-safety)", async () => {
    const result = await resolveAllowlistedPackages(
      ["@fixtures/cycle-a", "@fixtures/cycle-b"],
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result.files.map((f) => f.packageName).sort()).toEqual([
      "@fixtures/cycle-a",
      "@fixtures/cycle-b",
    ])
    expect(result.warnings).toHaveLength(0)
  })

  it("produces one warning per failing package, mixed with successes", async () => {
    const result = await resolveAllowlistedPackages(
      ["@fixtures/simple-pkg", "@fixtures/no-schema", "@fixtures/does-not-exist"],
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(result.files).toHaveLength(1)
    expect(result.warnings).toHaveLength(2)
  })

  it("populates origins, keyed by each resolved file's own path, for every successfully-resolved package", async () => {
    const result = await resolveAllowlistedPackages(
      ["@fixtures/simple-pkg"],
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    const [file] = result.files
    expect(file).toBeDefined()
    const origin = result.origins.get(file!.file)
    expect(origin).toMatchObject({
      packageName: "@fixtures/simple-pkg",
      declaredField: "./src/env.schema.ts",
      resolvedFile: file!.file,
    })
  })
})

describe("resolvePackageImport", () => {
  it("resolves a bare specifier matching an allow-listed package", async () => {
    const file = await resolvePackageImport(
      "@fixtures/simple-pkg",
      ["@fixtures/simple-pkg"],
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(file?.endsWith("simple-pkg/src/env.schema.ts")).toBe(true)
  })

  it("resolves a subpath specifier under an allow-listed package name", async () => {
    const file = await resolvePackageImport(
      "@fixtures/simple-pkg/whatever",
      ["@fixtures/simple-pkg"],
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(file?.endsWith("simple-pkg/src/env.schema.ts")).toBe(true)
  })

  it("returns undefined for a bare specifier not in the allowlist -- identical no-op to resolveRelativeImport", async () => {
    const file = await resolvePackageImport(
      "@fixtures/simple-pkg",
      [],
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(file).toBeUndefined()
  })

  it("returns undefined when the specifier matches an allow-listed package name but that package's own resolution fails", async () => {
    const file = await resolvePackageImport(
      "@fixtures/no-schema",
      ["@fixtures/no-schema"],
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(file).toBeUndefined()
  })

  it("returns undefined for a specifier that matches none of a NON-EMPTY allowlist -- distinguishes real matching from '.find() always matches'", async () => {
    const file = await resolvePackageImport(
      "@fixtures/completely-unrelated",
      ["@fixtures/simple-pkg"],
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(file).toBeUndefined()
  })

  it("does not treat a specifier that merely shares a prefix (no '/' subpath boundary) as a subpath match", async () => {
    // "@fixtures/simple-pkg-extra" starts with "@fixtures/simple-pkg" but not
    // with "@fixtures/simple-pkg/" -- must not match.
    const file = await resolvePackageImport(
      "@fixtures/simple-pkg-extra",
      ["@fixtures/simple-pkg"],
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(file).toBeUndefined()
  })
})

describe("mergeLocalAndPackageFiles", () => {
  it("deduplicates by realpath, not lexical path -- a locally-discovered symlink and its package-resolved realpath count once", async () => {
    const localSymlinkPath = path.join(
      fixtureRoot,
      "node_modules/@fixtures/safe-symlink/src/env.schema.ts",
    )
    const packageResolved = await resolvePackageSchemaFile(
      "@fixtures/safe-symlink",
      fixtureRoot,
      freshCache(),
      nodeBuildFs,
    )
    expect(packageResolved.ok).toBe(true)
    if (!packageResolved.ok) return

    const merged = await mergeLocalAndPackageFiles(
      [localSymlinkPath],
      [packageResolved.origin.resolvedFile],
      nodeBuildFs,
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]).toBe(localSymlinkPath) // local path string identity wins on collision
  })

  it("keeps genuinely distinct files distinct", async () => {
    const merged = await mergeLocalAndPackageFiles(
      [path.join(fixtureRoot, "node_modules/@fixtures/simple-pkg/src/env.schema.ts")],
      [path.join(fixtureRoot, "node_modules/@fixtures/decoy-walk/src/env.schema.ts")],
      nodeBuildFs,
    )
    expect(merged).toHaveLength(2)
  })

  it("never throws when a local file's own realpath fails -- falls back to the lexical path rather than dropping it", async () => {
    const nonExistentLocal = path.join(fixtureRoot, "does-not-exist-on-disk.ts")
    const merged = await mergeLocalAndPackageFiles([nonExistentLocal], [], nodeBuildFs)
    expect(merged).toEqual([nonExistentLocal])
  })

  it("keeps TWO distinct local files whose own realpath both fail -- the fallback must key the dedup set on each file's own path, not a shared value", async () => {
    // If the catch-block fallback (`real = file`) were ever skipped, `real`
    // would stay the SAME unassigned value across both iterations, and the
    // second nonexistent file would be wrongly deduped away as "already seen".
    const first = path.join(fixtureRoot, "does-not-exist-on-disk-1.ts")
    const second = path.join(fixtureRoot, "does-not-exist-on-disk-2.ts")
    const merged = await mergeLocalAndPackageFiles([first, second], [], nodeBuildFs)
    expect(merged).toEqual([first, second])
  })

  it("deduplicates two identical local paths against each other, not just against package files", async () => {
    const localPath = path.join(fixtureRoot, "node_modules/@fixtures/simple-pkg/src/env.schema.ts")
    const merged = await mergeLocalAndPackageFiles([localPath, localPath], [], nodeBuildFs)
    expect(merged).toHaveLength(1)
  })
})
