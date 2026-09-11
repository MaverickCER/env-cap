import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resolveRelativeImport } from "../../../src/build/resolution/resolve-import.js"
import { nodeBuildFs } from "../../support/build-filesystem.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(here, "fixtures-resolve-import")

async function write(relativePath: string, content: string): Promise<string> {
  const filePath = path.join(fixtureRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf8")
  return filePath
}

beforeEach(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
})
afterEach(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
})

describe("resolveRelativeImport", () => {
  it("resolves a ./sibling.js specifier to the real .ts file", async () => {
    const importingFile = await write("src/consumer.ts", "")
    await write("src/sibling.ts", "export const x = 1;\n")
    expect(await resolveRelativeImport(importingFile, "./sibling.js", nodeBuildFs)).toBe(
      path.resolve(fixtureRoot, "src/sibling.ts"),
    )
  })

  it("falls back to the .tsx candidate when no .ts file exists -- the second candidate tried, not just the first", async () => {
    const importingFile = await write("src/consumer.ts", "")
    await write("src/component.tsx", "export const x = 1;\n")
    expect(await resolveRelativeImport(importingFile, "./component.js", nodeBuildFs)).toBe(
      path.resolve(fixtureRoot, "src/component.tsx"),
    )
  })

  it("strips only the specifier's OWN trailing extension, not an embedded one earlier in the path", async () => {
    // "config.ts.old" -- an anchored `\.(js|jsx|ts|tsx)$` strips only the
    // real trailing ".js"; an unanchored one matches the FIRST such
    // substring instead (inside "config.ts.old"), producing the wrong
    // candidate path entirely.
    const importingFile = await write("src/consumer.ts", "")
    await write("src/config.ts.old.ts", "export const x = 1;\n")
    expect(await resolveRelativeImport(importingFile, "./config.ts.old.js", nodeBuildFs)).toBe(
      path.resolve(fixtureRoot, "src/config.ts.old.ts"),
    )
  })

  it("returns undefined for a candidate that doesn't exist on disk -- fileExists really checks, doesn't just assume", async () => {
    const importingFile = await write("src/consumer.ts", "")
    expect(await resolveRelativeImport(importingFile, "./nowhere.js", nodeBuildFs)).toBeUndefined()
  })

  it("returns undefined for a bare/package specifier (not ./ or ../)", async () => {
    const importingFile = await write("src/consumer.ts", "")
    expect(await resolveRelativeImport(importingFile, "some-package", nodeBuildFs)).toBeUndefined()
  })

  it("resolves a ../parent.js specifier -- the other relative-prefix clause, not just ./", async () => {
    const importingFile = await write("src/nested/consumer.ts", "")
    await write("src/parent.ts", "export const x = 1;\n")
    expect(await resolveRelativeImport(importingFile, "../parent.js", nodeBuildFs)).toBe(
      path.resolve(fixtureRoot, "src/parent.ts"),
    )
  })
})

// `resolveImportSpecifier`'s own job is purely compositional (which
// sub-resolver's result wins, and in what order) -- mocking the two
// sub-resolvers it delegates to isolates that composition logic from their
// own (already-tested-elsewhere) real filesystem/tsconfig behavior, and
// avoids building a real tsconfig-alias + node_modules-package fixture just
// to prove an early-return short-circuits correctly.
const { resolveAliasImportMock, resolvePackageImportMock } = vi.hoisted(() => ({
  resolveAliasImportMock: vi.fn(),
  resolvePackageImportMock: vi.fn(),
}))

vi.mock("../../../src/build/resolution/resolve-tsconfig-paths.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/build/resolution/resolve-tsconfig-paths.js")>()
  return { ...actual, resolveAliasImport: resolveAliasImportMock }
})

vi.mock("../../../src/build/resolution/resolve-package-schema.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/build/resolution/resolve-package-schema.js")>()
  return { ...actual, resolvePackageImport: resolvePackageImportMock }
})

describe("resolveImportSpecifier (composition)", () => {
  beforeEach(() => {
    resolveAliasImportMock.mockReset()
    resolvePackageImportMock.mockReset()
  })

  it("falls through to package resolution when alias resolution finds nothing, even though tsconfigPaths IS configured", async () => {
    const { resolveImportSpecifier } =
      await import("../../../src/build/resolution/resolve-import.js")
    resolveAliasImportMock.mockReturnValue(undefined)
    resolvePackageImportMock.mockResolvedValue("/resolved/via/package.ts")

    const context = {
      fs: nodeBuildFs,
      root: "/repo",
      packages: ["@acme/pkg"],
      cache: new Map(),
      tsconfigPaths: { baseUrl: "/repo", paths: {} } as never,
      aliasCache: new Map() as never,
    }
    const result = await resolveImportSpecifier("/repo/src/app.ts", "@acme/pkg", context)

    expect(resolveAliasImportMock).toHaveBeenCalled()
    expect(resolvePackageImportMock).toHaveBeenCalled()
    expect(result).toBe("/resolved/via/package.ts")
  })

  it("does NOT fall through to package resolution when alias resolution succeeds", async () => {
    const { resolveImportSpecifier } =
      await import("../../../src/build/resolution/resolve-import.js")
    resolveAliasImportMock.mockReturnValue("/resolved/via/alias.ts")

    const context = {
      fs: nodeBuildFs,
      root: "/repo",
      packages: ["@acme/pkg"],
      cache: new Map(),
      tsconfigPaths: { baseUrl: "/repo", paths: {} } as never,
      aliasCache: new Map() as never,
    }
    const result = await resolveImportSpecifier("/repo/src/app.ts", "@/lib", context)

    expect(result).toBe("/resolved/via/alias.ts")
    expect(resolvePackageImportMock).not.toHaveBeenCalled()
  })
})
