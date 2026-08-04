import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import {
  MAX_PACKAGE_SCHEMA_FILE_BYTES,
  mergeLocalAndPackageFiles,
  resolveAllowlistedPackages,
  resolvePackageImport,
  resolvePackageSchemaFile,
  type PackageSchemaResolutionResult,
} from "../../src/build/resolve-package-schema.js"

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
    const result = await resolvePackageSchemaFile("@fixtures/simple-pkg", fixtureRoot, freshCache())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.origin.packageName).toBe("@fixtures/simple-pkg")
      expect(result.origin.declaredField).toBe("./src/env.schema.ts")
      expect(result.origin.resolvedFile.endsWith("src/env.schema.ts")).toBe(true)
    }
  })

  it("reports PACKAGE_NOT_FOUND for a package that isn't installed", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/does-not-exist",
      fixtureRoot,
      freshCache(),
    )
    expect(result).toMatchObject({ ok: false, code: "PACKAGE_NOT_FOUND" })
  })

  it("reports FIELD_MISSING when the package.json has no envCap.schema field", async () => {
    const result = await resolvePackageSchemaFile("@fixtures/no-schema", fixtureRoot, freshCache())
    expect(result).toMatchObject({ ok: false, code: "FIELD_MISSING" })
  })

  it("reports INVALID_EXTENSION for a declared field pointing at compiled output", async () => {
    const result = await resolvePackageSchemaFile("@fixtures/wrong-ext", fixtureRoot, freshCache())
    expect(result).toMatchObject({ ok: false, code: "INVALID_EXTENSION" })
  })

  it("reports OUTSIDE_PACKAGE for a declared field that lexically escapes the package directory", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/escape-lexical",
      fixtureRoot,
      freshCache(),
    )
    expect(result).toMatchObject({ ok: false, code: "OUTSIDE_PACKAGE" })
  })

  it("reports OUTSIDE_PACKAGE for a symlink whose real target escapes the package directory", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/escape-symlink",
      fixtureRoot,
      freshCache(),
    )
    expect(result).toMatchObject({ ok: false, code: "OUTSIDE_PACKAGE" })
  })

  it("allows a symlink whose real target stays inside the package directory", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/safe-symlink",
      fixtureRoot,
      freshCache(),
    )
    expect(result.ok).toBe(true)
  })

  it("reports FILE_TOO_LARGE for a schema file exceeding the size cap", async () => {
    const result = await resolvePackageSchemaFile("@fixtures/too-big", fixtureRoot, freshCache())
    expect(result).toMatchObject({ ok: false, code: "FILE_TOO_LARGE" })
  })

  it("does not stop at a decoy nested package.json with no matching name during the upward walk", async () => {
    const result = await resolvePackageSchemaFile("@fixtures/decoy-walk", fixtureRoot, freshCache())
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.origin.resolvedFile.endsWith("decoy-walk/src/env.schema.ts")).toBe(true)
  })

  it("reports PACKAGE_NOT_FOUND when the upward walk exhausts its iteration budget without ever finding a matching package.json", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/deep-nomatch",
      fixtureRoot,
      freshCache(),
    )
    expect(result).toMatchObject({ ok: false, code: "PACKAGE_NOT_FOUND" })
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
    // Node itself can resolve at all -- spy on the read this code does once
    // it already has a resolved, Node-valid path in hand.
    const readFileSpy = vi.spyOn(fs, "readFile").mockResolvedValueOnce("{ this is not json")
    try {
      const result = await resolvePackageSchemaFile(
        "@fixtures/simple-pkg",
        fixtureRoot,
        freshCache(),
      )
      expect(result).toMatchObject({ ok: false, code: "MALFORMED_PACKAGE_JSON" })
    } finally {
      readFileSpy.mockRestore()
    }
  })

  it("reports MALFORMED_PACKAGE_JSON when the resolved package.json parses to something other than a JSON object", async () => {
    // A bare JSON string, not `[]` -- isRecord()'s own `typeof value ===
    // "object"` check does not exclude arrays, so this is the shape that
    // actually exercises the "not a JSON object" rejection.
    const readFileSpy = vi.spyOn(fs, "readFile").mockResolvedValueOnce('"just a string"')
    try {
      const result = await resolvePackageSchemaFile(
        "@fixtures/simple-pkg",
        fixtureRoot,
        freshCache(),
      )
      expect(result).toMatchObject({ ok: false, code: "MALFORMED_PACKAGE_JSON" })
    } finally {
      readFileSpy.mockRestore()
    }
  })

  it("reports OUTSIDE_PACKAGE when the declared field doesn't resolve to anything that exists on disk", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/missing-file",
      fixtureRoot,
      freshCache(),
    )
    expect(result).toMatchObject({ ok: false, code: "OUTSIDE_PACKAGE" })
  })

  it("reports OUTSIDE_PACKAGE when the declared field resolves to a directory rather than a regular file", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/schema-is-directory",
      fixtureRoot,
      freshCache(),
    )
    expect(result).toMatchObject({ ok: false, code: "OUTSIDE_PACKAGE" })
  })

  it("reports OUTSIDE_PACKAGE when fs.stat throws for the already-realpath'd file", async () => {
    const statSpy = vi
      .spyOn(fs, "stat")
      .mockRejectedValueOnce(new Error("ENOENT: simulated vanish between realpath and stat"))
    try {
      const result = await resolvePackageSchemaFile(
        "@fixtures/simple-pkg",
        fixtureRoot,
        freshCache(),
      )
      expect(result).toMatchObject({ ok: false, code: "OUTSIDE_PACKAGE" })
    } finally {
      statSpy.mockRestore()
    }
  })

  it("resolves correctly when the package directory itself is reached via a symlink (pnpm-style store)", async () => {
    const result = await resolvePackageSchemaFile(
      "@fixtures/symlinked-pkg",
      fixtureRoot,
      freshCache(),
    )
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.origin.resolvedFile.endsWith("symlinked-pkg-real/src/env.schema.ts")).toBe(true)
  })

  it("never calls fs.readdir -- resolution is bounded, not a directory treewalk", async () => {
    const readdirSpy = vi.spyOn(fs, "readdir")
    await resolvePackageSchemaFile("@fixtures/decoy-walk", fixtureRoot, freshCache())
    await resolvePackageSchemaFile("@fixtures/simple-pkg", fixtureRoot, freshCache())
    expect(readdirSpy).not.toHaveBeenCalled()
    readdirSpy.mockRestore()
  })
})

describe("resolveAllowlistedPackages", () => {
  it("deduplicates a package name listed more than once into a single resolution and a single warning", async () => {
    const cache = freshCache()
    const result = await resolveAllowlistedPackages(
      ["@fixtures/no-schema", "@fixtures/no-schema"],
      fixtureRoot,
      cache,
    )
    expect(result.files).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
  })

  it("resolves two independent, mutually-unrelated packages without recursion or cross-contamination (cycle-safety)", async () => {
    const result = await resolveAllowlistedPackages(
      ["@fixtures/cycle-a", "@fixtures/cycle-b"],
      fixtureRoot,
      freshCache(),
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
    )
    expect(result.files).toHaveLength(1)
    expect(result.warnings).toHaveLength(2)
  })
})

describe("resolvePackageImport", () => {
  it("resolves a bare specifier matching an allow-listed package", async () => {
    const file = await resolvePackageImport(
      "@fixtures/simple-pkg",
      ["@fixtures/simple-pkg"],
      fixtureRoot,
      freshCache(),
    )
    expect(file?.endsWith("simple-pkg/src/env.schema.ts")).toBe(true)
  })

  it("resolves a subpath specifier under an allow-listed package name", async () => {
    const file = await resolvePackageImport(
      "@fixtures/simple-pkg/whatever",
      ["@fixtures/simple-pkg"],
      fixtureRoot,
      freshCache(),
    )
    expect(file?.endsWith("simple-pkg/src/env.schema.ts")).toBe(true)
  })

  it("returns undefined for a bare specifier not in the allowlist -- identical no-op to resolveRelativeImport", async () => {
    const file = await resolvePackageImport("@fixtures/simple-pkg", [], fixtureRoot, freshCache())
    expect(file).toBeUndefined()
  })

  it("returns undefined when the specifier matches an allow-listed package name but that package's own resolution fails", async () => {
    const file = await resolvePackageImport(
      "@fixtures/no-schema",
      ["@fixtures/no-schema"],
      fixtureRoot,
      freshCache(),
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
    )
    expect(packageResolved.ok).toBe(true)
    if (!packageResolved.ok) return

    const merged = await mergeLocalAndPackageFiles(
      [localSymlinkPath],
      [packageResolved.origin.resolvedFile],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]).toBe(localSymlinkPath) // local path string identity wins on collision
  })

  it("keeps genuinely distinct files distinct", async () => {
    const merged = await mergeLocalAndPackageFiles(
      [path.join(fixtureRoot, "node_modules/@fixtures/simple-pkg/src/env.schema.ts")],
      [path.join(fixtureRoot, "node_modules/@fixtures/decoy-walk/src/env.schema.ts")],
    )
    expect(merged).toHaveLength(2)
  })

  it("never throws when a local file's own realpath fails -- falls back to the lexical path rather than dropping it", async () => {
    const nonExistentLocal = path.join(fixtureRoot, "does-not-exist-on-disk.ts")
    const merged = await mergeLocalAndPackageFiles([nonExistentLocal], [])
    expect(merged).toEqual([nonExistentLocal])
  })

  it("deduplicates two identical local paths against each other, not just against package files", async () => {
    const localPath = path.join(fixtureRoot, "node_modules/@fixtures/simple-pkg/src/env.schema.ts")
    const merged = await mergeLocalAndPackageFiles([localPath, localPath], [])
    expect(merged).toHaveLength(1)
  })
})
