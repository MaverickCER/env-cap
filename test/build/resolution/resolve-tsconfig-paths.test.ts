import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  createAliasResolutionCache,
  loadTsconfigPaths,
  resolveAliasImport,
} from "../../../src/build/resolution/resolve-tsconfig-paths.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(here, "fixtures-resolve-tsconfig-paths")

async function writeJson(relativePath: string, value: unknown): Promise<string> {
  const filePath = path.join(fixtureRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8")
  return filePath
}

async function writeFile(relativePath: string, content: string): Promise<string> {
  const filePath = path.join(fixtureRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf8")
  return filePath
}

beforeAll(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })

  // Scenario: default auto-detection finds `root/tsconfig.json`.
  await writeJson("default-autodetect/tsconfig.json", {
    compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } },
  })
  await writeFile("default-autodetect/src/env.schema.ts", "export const a = 1;\n")

  // Scenario: no tsconfig.json at all -- default auto-detection must be silent.
  await fs.mkdir(path.join(fixtureRoot, "no-tsconfig"), { recursive: true })

  // Scenario: explicit override path.
  await writeJson("explicit-override/custom.tsconfig.json", {
    compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } },
  })

  // Scenario: malformed JSON.
  await writeFile("malformed/tsconfig.json", '{ "compilerOptions": ')

  // Scenario: tsconfig.json with neither `paths` nor `baseUrl`.
  await writeJson("no-paths/tsconfig.json", { compilerOptions: { target: "ES2020" } })

  // Scenario: `baseUrl` set with no `paths` at all.
  await writeJson("baseurl-only/tsconfig.json", { compilerOptions: { baseUrl: "." } })
  await writeFile("baseurl-only/src/env/schema.ts", "export const b = 1;\n")

  // Scenario: `extends` chain -- `paths` declared only in the base config.
  await writeJson("extends-chain/base.tsconfig.json", {
    compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } },
  })
  await writeJson("extends-chain/tsconfig.json", { extends: "./base.tsconfig.json" })
  await writeFile("extends-chain/src/env.schema.ts", "export const c = 1;\n")

  // Scenario: multiple fallback targets for one alias -- only the second exists.
  await writeJson("multi-fallback/tsconfig.json", {
    compilerOptions: { baseUrl: ".", paths: { "@env/*": ["generated/*", "src/*"] } },
  })
  await writeFile("multi-fallback/src/foo.ts", "export const d = 1;\n")

  // Scenario: a contrived alias resolving into node_modules -- must be discarded.
  await writeJson("node-modules-boundary/tsconfig.json", {
    compilerOptions: { baseUrl: ".", paths: { "@pkg/*": ["node_modules/@pkg/*"] } },
  })
  await writeFile("node-modules-boundary/node_modules/@pkg/foo.ts", "export const e = 1;\n")

  // Scenario: resolution caching.
  await writeJson("caching/tsconfig.json", {
    compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } },
  })
  await writeFile("caching/src/foo.ts", "export const f = 1;\n")
})

afterAll(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
})

function root(name: string): string {
  return path.join(fixtureRoot, name)
}

describe("loadTsconfigPaths", () => {
  it("auto-detects root/tsconfig.json by default", async () => {
    const { resolution, warning } = await loadTsconfigPaths(root("default-autodetect"), undefined)
    expect(warning).toBeUndefined()
    expect(resolution).toBeDefined()
    expect(resolution?.configFile).toBe(path.join(root("default-autodetect"), "tsconfig.json"))
  })

  it("is silent when no tsconfig.json exists and no explicit path was given", async () => {
    const { resolution, warning } = await loadTsconfigPaths(root("no-tsconfig"), undefined)
    expect(resolution).toBeUndefined()
    expect(warning).toBeUndefined()
  })

  it("resolves an explicit override path relative to root", async () => {
    const { resolution, warning } = await loadTsconfigPaths(
      root("explicit-override"),
      "custom.tsconfig.json",
    )
    expect(warning).toBeUndefined()
    expect(resolution).toBeDefined()
    expect(resolution?.configFile).toBe(
      path.join(root("explicit-override"), "custom.tsconfig.json"),
    )
  })

  it("warns when an explicit override path doesn't exist", async () => {
    const { resolution, warning } = await loadTsconfigPaths(root("no-tsconfig"), "missing.json")
    expect(resolution).toBeUndefined()
    expect(warning).toBeDefined()
    expect(warning?.message).toContain("missing.json")
  })

  it("disables alias resolution entirely when tsconfig: false", async () => {
    const { resolution, warning } = await loadTsconfigPaths(root("default-autodetect"), false)
    expect(resolution).toBeUndefined()
    expect(warning).toBeUndefined()
  })

  it("warns on malformed JSON", async () => {
    const { resolution, warning } = await loadTsconfigPaths(root("malformed"), undefined)
    expect(resolution).toBeUndefined()
    expect(warning).toBeDefined()
  })

  it("is a no-op, without warning, when the tsconfig declares neither paths nor baseUrl", async () => {
    const { resolution, warning } = await loadTsconfigPaths(root("no-paths"), undefined)
    expect(resolution).toBeUndefined()
    expect(warning).toBeUndefined()
  })

  it("builds a resolution for a baseUrl-only tsconfig with no paths at all", async () => {
    const { resolution, warning } = await loadTsconfigPaths(root("baseurl-only"), undefined)
    expect(warning).toBeUndefined()
    expect(resolution).toBeDefined()
    expect(resolution?.compilerOptions.baseUrl).toBeDefined()
  })

  it("resolves paths declared only through an extends chain", async () => {
    const { resolution, warning } = await loadTsconfigPaths(root("extends-chain"), undefined)
    expect(warning).toBeUndefined()
    expect(resolution).toBeDefined()
    expect(resolution?.compilerOptions.paths).toBeDefined()
  })
})

describe("resolveAliasImport", () => {
  it("resolves a bare specifier via `paths`", async () => {
    const { resolution } = await loadTsconfigPaths(root("default-autodetect"), undefined)
    const cache = createAliasResolutionCache()
    const importingFile = path.join(root("default-autodetect"), "consumer.ts")
    const resolved = resolveAliasImport("@/env.schema.js", importingFile, resolution!, cache)
    expect(resolved).toBe(path.join(root("default-autodetect"), "src/env.schema.ts"))
  })

  it("resolves a bare specifier via `baseUrl` alone, with no `paths` configured", async () => {
    const { resolution } = await loadTsconfigPaths(root("baseurl-only"), undefined)
    const cache = createAliasResolutionCache()
    const importingFile = path.join(root("baseurl-only"), "consumer.ts")
    const resolved = resolveAliasImport("src/env/schema.js", importingFile, resolution!, cache)
    expect(resolved).toBe(path.join(root("baseurl-only"), "src/env/schema.ts"))
  })

  it("resolves the first existing target among multiple fallback paths for one alias", async () => {
    const { resolution } = await loadTsconfigPaths(root("multi-fallback"), undefined)
    const cache = createAliasResolutionCache()
    const importingFile = path.join(root("multi-fallback"), "consumer.ts")
    const resolved = resolveAliasImport("@env/foo.js", importingFile, resolution!, cache)
    // "generated/foo.ts" doesn't exist; "src/foo.ts" does -- ts.resolveModuleName()
    // must fall through to the second target, exactly like tsc itself would.
    expect(resolved).toBe(path.join(root("multi-fallback"), "src/foo.ts"))
  })

  it("discards a resolution that lands inside node_modules -- that's ADR 0014's mechanism, not this one's", async () => {
    const { resolution } = await loadTsconfigPaths(root("node-modules-boundary"), undefined)
    const cache = createAliasResolutionCache()
    const importingFile = path.join(root("node-modules-boundary"), "consumer.ts")
    const resolved = resolveAliasImport("@pkg/foo.js", importingFile, resolution!, cache)
    expect(resolved).toBeUndefined()
  })

  it("returns undefined for a specifier that doesn't resolve to any real file", async () => {
    const { resolution } = await loadTsconfigPaths(root("default-autodetect"), undefined)
    const cache = createAliasResolutionCache()
    const importingFile = path.join(root("default-autodetect"), "consumer.ts")
    const resolved = resolveAliasImport("@/does-not-exist.js", importingFile, resolution!, cache)
    expect(resolved).toBeUndefined()
  })

  it("memoizes repeated resolution of the same (importingFile, specifier) pair", async () => {
    const { resolution } = await loadTsconfigPaths(root("caching"), undefined)
    const cache = createAliasResolutionCache()
    const importingFile = path.join(root("caching"), "consumer.ts")

    const first = resolveAliasImport("@/foo.js", importingFile, resolution!, cache)
    expect(cache.resolutions.size).toBe(1)

    const second = resolveAliasImport("@/foo.js", importingFile, resolution!, cache)
    // Same (importingFile, specifier) pair -- served from cache, no new entry.
    expect(cache.resolutions.size).toBe(1)
    expect(first).toBe(second)

    resolveAliasImport("@/does-not-exist.js", importingFile, resolution!, cache)
    // A distinct specifier is a distinct cache key, including the `undefined` miss.
    expect(cache.resolutions.size).toBe(2)
  })
})
