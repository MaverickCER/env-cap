import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EnvProjectGenerationError } from "../../src/build/errors.js"
import { generateEnvArtifacts } from "../../src/build/generate-env-artifacts.js"

// Node's native `fs/promises` ESM bindings are non-configurable, so
// `vi.spyOn` can't install a spy directly on them (`Cannot redefine
// property`). Mocking the module instead gives us `vi.fn()`-wrapped
// `readFile`/`writeFile` that default to the real implementation, so every
// other test in this file (which just reads/writes fixtures) keeps working
// unmodified.
const { readFileMock, writeFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
}))

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  // Node synthesizes a `default` export (equal to the whole module) for this
  // CJS-style builtin; the type declarations don't know about it.
  const actualDefault = (actual as unknown as { default: typeof actual }).default
  readFileMock.mockImplementation(actual.readFile)
  writeFileMock.mockImplementation(actual.writeFile)
  return {
    ...actual,
    readFile: readFileMock,
    writeFile: writeFileMock,
    default: { ...actualDefault, readFile: readFileMock, writeFile: writeFileMock },
  }
})

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(here, "fixtures-project")

async function write(relativePath: string, content: string): Promise<string> {
  const filePath = path.join(fixtureRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf8")
  return filePath
}

beforeEach(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
  await write(
    "features/payments/env.schema.ts",
    `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });
    documentEnv({ STRIPE_KEY: {} }, { owner: "payments-team" });`,
  )
  await write(
    "src/server.ts",
    `import { paymentsEnv } from "../features/payments/env.schema.js";\npaymentsEnv.STRIPE_KEY;`,
  )
})

afterEach(async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")
  readFileMock.mockReset().mockImplementation(actual.readFile)
  writeFileMock.mockReset().mockImplementation(actual.writeFile)
  await fs.rm(fixtureRoot, { recursive: true, force: true })
})

describe("generateEnvArtifacts", () => {
  it("running all three passes together is equivalent to calling each individually", async () => {
    const result = await generateEnvArtifacts({
      root: fixtureRoot,
      manifest: { location: "src/generated/env.manifest.ts" },
      docs: { location: "docs/ENVIRONMENT.md" },
      usage: { report: { location: "docs/OWNERSHIP.md" } },
    })

    expect(result.manifest).toBeDefined()
    expect(result.docs).toBeDefined()
    expect(result.usage).toBeDefined()

    await expect(fs.access(result.manifest!.outputPath)).resolves.toBeUndefined()
    await expect(fs.access(result.docs!.docsPath)).resolves.toBeUndefined()
    await expect(fs.access(result.usage!.reportPath!)).resolves.toBeUndefined()

    expect(result.manifest!.contracts).toHaveLength(1)
    expect(result.docs!.contracts).toHaveLength(1)
    expect(result.usage!.dependencyOwnership).toHaveLength(1)
  })

  it("manifest: false (or omitted) skips that pass cleanly", async () => {
    const result = await generateEnvArtifacts({
      root: fixtureRoot,
      manifest: false,
      docs: { location: "docs/ENVIRONMENT.md" },
    })

    expect(result.manifest).toBeUndefined()
    expect(result.docs).toBeDefined()

    const result2 = await generateEnvArtifacts({
      root: fixtureRoot,
      docs: { location: "docs/ENVIRONMENT2.md" },
    })
    expect(result2.manifest).toBeUndefined()
  })

  it("docs: false and usage: false both skip their pass cleanly, alongside a successful envExample resolution", async () => {
    const result = await generateEnvArtifacts({
      root: fixtureRoot,
      manifest: { location: "src/generated/skip-docs-usage.manifest.ts" },
      docs: {
        location: "docs/skip-docs-usage.ENVIRONMENT.md",
        envExample: { location: ".env.example.skip-docs-usage" },
      },
      usage: false,
    })
    expect(result.usage).toBeUndefined()
    expect(result.docs?.envExample?.writtenPath).toBe(
      path.resolve(fixtureRoot, ".env.example.skip-docs-usage"),
    )

    const result2 = await generateEnvArtifacts({
      root: fixtureRoot,
      manifest: { location: "src/generated/skip-docs-usage2.manifest.ts" },
      docs: false,
    })
    expect(result2.docs).toBeUndefined()
  })

  it("discovers and links the schema graph exactly once, regardless of how many passes are requested", async () => {
    const schemaFile = path.resolve(fixtureRoot, "features/payments/env.schema.ts")

    await generateEnvArtifacts({
      root: fixtureRoot,
      manifest: { location: "src/generated/env.manifest.ts" },
      docs: { location: "docs/ENVIRONMENT.md" },
      usage: { report: { location: "docs/OWNERSHIP.md" } },
    })

    const schemaFileReads = readFileMock.mock.calls.filter((call) => call[0] === schemaFile)
    expect(schemaFileReads).toHaveLength(1)
  })

  it("compute atomicity: nothing from any pass is written if any requested pass blocks", async () => {
    await write(
      "features/broken-a/env.schema.ts",
      `export const brokenAEnv = createEnv({ SHARED: { processor: (v): string => String(v) } }, { name: "broken-a" });`,
    )
    await write(
      "features/broken-b/env.schema.ts",
      `export const brokenBEnv = createEnv({ SHARED: { processor: (v): boolean => Boolean(v) } }, { name: "broken-b" });`,
    )

    const manifestLocation = path.resolve(fixtureRoot, "src/generated/atomicity.manifest.ts")
    const docsLocation = path.resolve(fixtureRoot, "docs/atomicity.ENVIRONMENT.md")
    await fs.rm(manifestLocation, { force: true })
    await fs.rm(docsLocation, { force: true })

    await expect(
      generateEnvArtifacts({
        root: fixtureRoot,
        include: ["features/broken-*/env.schema.ts", "features/payments/env.schema.ts"],
        manifest: { location: "src/generated/atomicity.manifest.ts", onIncompatibility: "throw" },
        docs: { location: "docs/atomicity.ENVIRONMENT.md" },
      }),
    ).rejects.toThrow(EnvProjectGenerationError)

    await expect(fs.access(manifestLocation)).rejects.toThrow()
    await expect(fs.access(docsLocation)).rejects.toThrow()
  })

  it("write atomicity is NOT guaranteed: a write failure on a later pass leaves an earlier pass's file on disk", async () => {
    const manifestLocation = path.resolve(fixtureRoot, "src/generated/write-fail.manifest.ts")
    const docsLocation = path.resolve(fixtureRoot, "docs/write-fail.ENVIRONMENT.md")
    await fs.rm(manifestLocation, { force: true })
    await fs.rm(docsLocation, { force: true })

    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")
    writeFileMock.mockImplementation(async (file, ...rest: unknown[]) => {
      if (file === docsLocation) throw new Error("simulated disk-full error")
      // Forwarding to the real multi-overload fs.writeFile with spread,
      // unknown-typed args -- no single overload matches, hence the `any` cast.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
      return (actual.writeFile as any)(file, ...rest)
    })

    await expect(
      generateEnvArtifacts({
        root: fixtureRoot,
        manifest: { location: "src/generated/write-fail.manifest.ts" },
        docs: { location: "docs/write-fail.ENVIRONMENT.md" },
      }),
    ).rejects.toThrow(/simulated disk-full error/)

    // The manifest write completed before the docs write failed -- the
    // documented write-non-atomicity gap, not a hidden one.
    await expect(fs.access(manifestLocation)).resolves.toBeUndefined()
    await expect(fs.access(docsLocation)).rejects.toThrow()
  })

  it("rejects escaping output paths across manifest and docs together, in one aggregated error, before any discovery or write", async () => {
    const outsideManifest = path.resolve(fixtureRoot, "..", "escaped-project-manifest.ts")
    const outsideDocs = path.resolve(fixtureRoot, "..", "escaped-project-docs.md")
    await fs.rm(outsideManifest, { force: true })
    await fs.rm(outsideDocs, { force: true })

    const error = await generateEnvArtifacts({
      root: fixtureRoot,
      manifest: { location: "../escaped-project-manifest.ts" },
      docs: { location: "../escaped-project-docs.md" },
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(EnvProjectGenerationError)
    expect((error as EnvProjectGenerationError).issues).toHaveLength(2)

    await expect(fs.access(outsideManifest)).rejects.toThrow()
    await expect(fs.access(outsideDocs)).rejects.toThrow()
  })

  it("rejects an escaping docs.envExample.location, distinct from an escaping docs.location itself", async () => {
    const outside = path.resolve(fixtureRoot, "..", "escaped-env-example.env.example")
    await fs.rm(outside, { force: true })

    const error = await generateEnvArtifacts({
      root: fixtureRoot,
      docs: {
        location: "docs/ENVIRONMENT.md",
        envExample: { location: "../escaped-env-example.env.example" },
      },
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(EnvProjectGenerationError)
    await expect(fs.access(outside)).rejects.toThrow()
    await expect(fs.access(path.resolve(fixtureRoot, "docs/ENVIRONMENT.md"))).rejects.toThrow()
  })

  it("defaults root to process.cwd() when omitted", async () => {
    const originalCwd = process.cwd()
    process.chdir(fixtureRoot)
    try {
      const result = await generateEnvArtifacts({
        manifest: { location: "src/generated/cwd-default.manifest.ts" },
      })
      expect(result.manifest?.contracts.length).toBeGreaterThan(0)
    } finally {
      process.chdir(originalCwd)
    }
  })

  describe("liveExpirationDates", () => {
    beforeEach(async () => {
      await write(
        "features/live/env.schema.ts",
        `export const liveEnv = createEnv({ LIVE_KEY: {} }, { name: "live" });
        documentEnv({ LIVE_KEY: {} }, { variables: { LIVE_KEY: { expiresAt: "2099-01-01" } } });`,
      )
    })

    it("is invoked exactly once at the orchestrator level, even with manifest+docs+usage all requested", async () => {
      const liveExpirationDates = vi.fn().mockResolvedValue({})
      await generateEnvArtifacts({
        root: fixtureRoot,
        include: ["features/live/**/env.schema.ts"],
        manifest: { location: "src/generated/live.manifest.ts" },
        docs: { location: "docs/live.ENVIRONMENT.md" },
        usage: { report: { location: "docs/live.OWNERSHIP.md" } },
        liveExpirationDates,
      })
      expect(liveExpirationDates).toHaveBeenCalledTimes(1)
    })

    it("is not invoked when docs is false or omitted, even if liveExpirationDates is set", async () => {
      const liveExpirationDates = vi.fn().mockResolvedValue({})
      await generateEnvArtifacts({
        root: fixtureRoot,
        include: ["features/live/**/env.schema.ts"],
        manifest: { location: "src/generated/live-no-docs.manifest.ts" },
        liveExpirationDates,
      })
      expect(liveExpirationDates).not.toHaveBeenCalled()
    })

    it("does not affect the manifest pass's written output", async () => {
      const withoutOverride = await generateEnvArtifacts({
        root: fixtureRoot,
        include: ["features/live/**/env.schema.ts"],
        manifest: { location: "src/generated/live-manifest-a.manifest.ts" },
        docs: { location: "docs/live-manifest-a.ENVIRONMENT.md" },
      })
      const withOverride = await generateEnvArtifacts({
        root: fixtureRoot,
        include: ["features/live/**/env.schema.ts"],
        manifest: { location: "src/generated/live-manifest-b.manifest.ts" },
        docs: { location: "docs/live-manifest-b.ENVIRONMENT.md" },
        liveExpirationDates: async () => ({ LIVE_KEY: "2026-01-01" }),
      })

      const manifestWithout = await fs.readFile(withoutOverride.manifest!.outputPath, "utf8")
      const manifestWith = await fs.readFile(withOverride.manifest!.outputPath, "utf8")
      expect(manifestWith).toBe(manifestWithout)
    })

    it("the written docs file reflects the overridden value", async () => {
      const result = await generateEnvArtifacts({
        root: fixtureRoot,
        include: ["features/live/**/env.schema.ts"],
        docs: { location: "docs/live-override.ENVIRONMENT.md" },
        liveExpirationDates: async () => ({ LIVE_KEY: "2026-01-01" }),
      })

      const docsSource = await fs.readFile(result.docs!.docsPath, "utf8")
      expect(docsSource).toContain("2026-01-01")
      expect(docsSource).not.toContain("2099-01-01")
    })
  })

  describe("with the usage pass included", () => {
    it("all three passes share the single discovery result and produce consistent contract counts", async () => {
      const result = await generateEnvArtifacts({
        root: fixtureRoot,
        manifest: { location: "src/generated/combined.manifest.ts" },
        docs: { location: "docs/combined.ENVIRONMENT.md" },
        usage: { report: { location: "docs/combined.OWNERSHIP.md" } },
      })

      expect(result.manifest!.contracts).toHaveLength(1)
      expect(result.docs!.contracts).toHaveLength(1)
      expect(result.usage!.dependencyOwnership).toHaveLength(1)
    })

    it("rejects an escaping usage.report.location alongside otherwise-valid manifest/docs locations, atomically", async () => {
      const outsideOwnership = path.resolve(fixtureRoot, "..", "escaped-ownership.md")
      await fs.rm(outsideOwnership, { force: true })
      const manifestLocation = path.resolve(fixtureRoot, "src/generated/usage-escape.manifest.ts")
      await fs.rm(manifestLocation, { force: true })

      await expect(
        generateEnvArtifacts({
          root: fixtureRoot,
          manifest: { location: "src/generated/usage-escape.manifest.ts" },
          usage: { report: { location: "../escaped-ownership.md" } },
        }),
      ).rejects.toThrow(EnvProjectGenerationError)

      await expect(fs.access(outsideOwnership)).rejects.toThrow()
      await expect(fs.access(manifestLocation)).rejects.toThrow()
    })
  })

  describe("tsconfig path alias resolution (ADR 0023, Experimental)", () => {
    beforeEach(async () => {
      await write(
        "tsconfig.json",
        JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } }),
      )
      await write(
        "src/features/billing/env.schema.ts",
        `export const billingEnv = createEnv({ INVOICE_KEY: {} }, { name: "billing" });
        documentEnv({ INVOICE_KEY: {} }, { owner: "billing-team" });`,
      )
      await write(
        "src/consumer.ts",
        `import { billingEnv } from "@/features/billing/env.schema.js";\nbillingEnv.INVOICE_KEY;`,
      )
    })

    it("a contract only reachable through an alias is discovered, documented, and not abandoned -- one loaded tsconfig, shared across all three passes (ADR 0011)", async () => {
      const result = await generateEnvArtifacts({
        root: fixtureRoot,
        manifest: { location: "src/generated/alias.manifest.ts" },
        docs: { location: "docs/alias.ENVIRONMENT.md" },
        usage: { report: { location: "docs/alias.OWNERSHIP.md" } },
      })

      // Two contracts: the outer beforeEach's relatively-imported "payments" plus this block's aliased "billing".
      expect(result.manifest!.contracts).toHaveLength(2)
      expect(result.docs!.contracts).toHaveLength(2)
      expect(result.usage!.dependencyOwnership).toHaveLength(2)
      expect(result.usage!.abandonedContracts).toEqual([])
      // Not just "not abandoned" -- INVOICE_KEY was actually member-accessed
      // (`billingEnv.INVOICE_KEY` above), so it must never show up as
      // unconsumed or indeterminate either.
      expect(result.usage!.unconsumedOwnedVariables).toEqual([])
      expect(result.usage!.indeterminate).toEqual([])

      const billing = result.usage!.dependencyOwnership.find((e) => e.contractName === "billing")
      expect(billing?.consumers).toEqual([
        path.relative(fixtureRoot, path.join(fixtureRoot, "src/consumer.ts")),
      ])
    })
  })

  it("still rejects an absolute output path outside root when only one pass is requested", async () => {
    const outside = path.join(os.tmpdir(), `env-cap-project-escape-test-${Date.now()}.ts`)
    await fs.rm(outside, { force: true })

    await expect(
      generateEnvArtifacts({ root: fixtureRoot, manifest: { location: outside } }),
    ).rejects.toThrow(EnvProjectGenerationError)

    await expect(fs.access(outside)).rejects.toThrow()
  })
})
