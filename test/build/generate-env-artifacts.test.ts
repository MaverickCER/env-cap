import { nodeBuildFs } from "../support/build-filesystem.js"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { checkEnvArtifacts } from "../../src/build/check-artifacts.js"
import { EnvProjectGenerationError } from "../../src/build/errors.js"
import {
  escalatedFindings,
  findingFiles,
  findingSubject,
  generateEnvArtifacts,
} from "../../src/build/generate-env-artifacts.js"
import type { Finding } from "../../src/build/finding-model.js"

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

// Wraps (never replaces) the real `computeSourceFingerprint`, purely so the
// write path's own `options.packages ?? []` call argument (distinct from
// `computeArtifacts()`'s own copy, computed once at the top of that separate
// function and out of scope at the write path) is directly observable --
// asserting on the resulting fingerprint *value* would require duplicating
// its own internal hashing logic just to tell two fingerprints apart.
const { computeSourceFingerprintMock } = vi.hoisted(() => ({
  computeSourceFingerprintMock: vi.fn(),
}))

vi.mock("../../src/build/evidence-cache.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/build/evidence-cache.js")>()
  computeSourceFingerprintMock.mockImplementation(actual.computeSourceFingerprint)
  return { ...actual, computeSourceFingerprint: computeSourceFingerprintMock }
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

function documentationWarning(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "warning",
    code: "UNDOCUMENTED_VARIABLE",
    family: "documentation",
    message: "message text",
    location: {
      model: "contract",
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variable: "KEY",
      position: undefined,
    },
    ...overrides,
  }
}

describe("findingSubject", () => {
  it("labels a change-model finding by its artifact path", () => {
    expect(
      findingSubject(
        documentationWarning({ location: { model: "change", path: "/repo/env.manifest.ts" } }),
      ),
    ).toBe("(artifact) /repo/env.manifest.ts")
  })

  it("uses the variable name directly when the location names one", () => {
    expect(
      findingSubject(
        documentationWarning({
          location: {
            model: "contract",
            file: "/repo/a/env.schema.ts",
            exportName: "aEnv",
            variable: "STRIPE_KEY",
            position: undefined,
          },
        }),
      ),
    ).toBe("STRIPE_KEY")
  })

  it("labels a contract-level ownership finding by its contractName", () => {
    expect(
      findingSubject(
        documentationWarning({
          family: "ownership",
          location: {
            model: "ownership",
            contractName: "payments",
            file: "/repo/a/env.schema.ts",
            variable: undefined,
            position: undefined,
          },
        }),
      ),
    ).toBe("(contract) payments")
  })

  it("labels a contract-level (non-ownership) finding by its exportName", () => {
    expect(
      findingSubject(
        documentationWarning({
          location: {
            model: "contract",
            file: "/repo/a/env.schema.ts",
            exportName: "aEnv",
            variable: undefined,
            position: undefined,
          },
        }),
      ),
    ).toBe("(contract) aEnv")
  })

  it("falls back to 'unknown' when a contract-level finding names neither an exportName nor a contractName", () => {
    expect(
      findingSubject(
        documentationWarning({
          location: {
            model: "contract",
            file: undefined,
            exportName: undefined,
            variable: undefined,
            position: undefined,
          },
        }),
      ),
    ).toBe("(contract) unknown")
  })
})

describe("findingFiles", () => {
  it("names the artifact path for a change-model finding", () => {
    expect(
      findingFiles(
        documentationWarning({ location: { model: "change", path: "/repo/env.manifest.ts" } }),
      ),
    ).toEqual(["/repo/env.manifest.ts"])
  })

  it("names the declaring file when the location has one", () => {
    expect(
      findingFiles(
        documentationWarning({
          location: {
            model: "contract",
            file: "/repo/a/env.schema.ts",
            exportName: "aEnv",
            variable: undefined,
            position: undefined,
          },
        }),
      ),
    ).toEqual(["/repo/a/env.schema.ts"])
  })

  it("names no files at all when the location carries none", () => {
    expect(
      findingFiles(
        documentationWarning({
          family: "ownership",
          location: {
            model: "ownership",
            contractName: "payments",
            file: undefined,
            variable: undefined,
            position: undefined,
          },
        }),
      ),
    ).toEqual([])
  })
})

describe("escalatedFindings", () => {
  it("escalates only warning-severity findings in the requested family, to a matching CompatibilityIssue", () => {
    const finding = documentationWarning({ code: "UNDOCUMENTED_VARIABLE", message: "no docs" })
    const issues = escalatedFindings([finding], "documentation")
    expect(issues).toEqual([
      {
        severity: "error",
        variable: "KEY",
        files: ["/repo/a/env.schema.ts"],
        reason: "[UNDOCUMENTED_VARIABLE] no docs",
      },
    ])
  })

  it("never escalates a finding from a DIFFERENT family, even if it's a warning", () => {
    const finding = documentationWarning({ family: "ownership" })
    expect(escalatedFindings([finding], "documentation")).toEqual([])
  })

  it("never escalates an error-severity finding, even in the requested family", () => {
    const finding = documentationWarning({ severity: "error" })
    expect(escalatedFindings([finding], "documentation")).toEqual([])
  })

  it("never escalates an info-severity finding, even in the requested family", () => {
    const finding = documentationWarning({ severity: "info" })
    expect(escalatedFindings([finding], "documentation")).toEqual([])
  })
})

describe("generateEnvArtifacts", () => {
  it("running all three passes together is equivalent to calling each individually", async () => {
    const result = await generateEnvArtifacts({
      fs: nodeBuildFs,
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
      fs: nodeBuildFs,
      root: fixtureRoot,
      manifest: false,
      docs: { location: "docs/ENVIRONMENT.md" },
    })

    expect(result.manifest).toBeUndefined()
    expect(result.docs).toBeDefined()

    const result2 = await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      docs: { location: "docs/ENVIRONMENT2.md" },
    })
    expect(result2.manifest).toBeUndefined()
  })

  it("docs: false and usage: false both skip their pass cleanly, alongside a successful envExample resolution", async () => {
    const result = await generateEnvArtifacts({
      fs: nodeBuildFs,
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
      fs: nodeBuildFs,
      root: fixtureRoot,
      manifest: { location: "src/generated/skip-docs-usage2.manifest.ts" },
      docs: false,
    })
    expect(result2.docs).toBeUndefined()
  })

  it("discovers and links the schema graph exactly once, regardless of how many passes are requested", async () => {
    const schemaFile = path.resolve(fixtureRoot, "features/payments/env.schema.ts")

    await generateEnvArtifacts({
      fs: nodeBuildFs,
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
        fs: nodeBuildFs,
        root: fixtureRoot,
        include: ["features/broken-*/env.schema.ts", "features/payments/env.schema.ts"],
        manifest: { location: "src/generated/atomicity.manifest.ts", onIncompatibility: "throw" },
        docs: { location: "docs/atomicity.ENVIRONMENT.md" },
      }),
    ).rejects.toThrow(EnvProjectGenerationError)

    await expect(fs.access(manifestLocation)).rejects.toThrow()
    await expect(fs.access(docsLocation)).rejects.toThrow()
  })

  it("manifest.onIncompatibility: 'throw' escalates a warning-severity issue that the 'warn' default would not block on", async () => {
    await write(
      "features/warn-a/env.schema.ts",
      `export const warnAEnv = createEnv({ SHARED_ONCOMPAT: { processor: (v) => String(v) } }, { name: "warn-a" });`,
    )
    await write(
      "features/warn-b/env.schema.ts",
      `export const warnBEnv = createEnv({ SHARED_ONCOMPAT: { processor: (v) => String(v).trim() } }, { name: "warn-b" });`,
    )

    // Same conflict, same include set -- "warn" (the default) does not block,
    // but the warning is still surfaced in Finding Model's own compatibility
    // family (fed by `activeContracts`, independent of whether it blocks).
    const warnResult = await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      include: ["features/warn-*/env.schema.ts"],
      manifest: { location: "src/generated/oncompat-warn.manifest.ts" },
    })
    expect(
      warnResult.evidence.finding.findings.some(
        (f) => f.family === "compatibility" && f.code === "PROCESSOR_SOURCE_CONFLICT",
      ),
    ).toBe(true)

    // "throw" escalates the identical warning-severity issue into a blocking error.
    await expect(
      generateEnvArtifacts({
        fs: nodeBuildFs,
        root: fixtureRoot,
        include: ["features/warn-*/env.schema.ts"],
        manifest: {
          location: "src/generated/oncompat-throw.manifest.ts",
          onIncompatibility: "throw",
        },
      }),
    ).rejects.toThrow(EnvProjectGenerationError)
  })

  it("Finding Model's compatibility detection only considers active contracts, even when no manifest pass is requested", async () => {
    // detectExclusiveGroupIssues() filters `.active` internally regardless of
    // its caller's own filtering, so it can't distinguish this mutant --
    // detectCompatibilityIssues() has no such internal filter, so a
    // processor-return-type conflict between an active and an INACTIVE
    // contract is the right shape to isolate generate-env-artifacts.ts's own
    // `activeContracts` filter (line 337).
    await write(
      "features/conflict-active/env.schema.ts",
      `export const conflictActiveEnv = createEnv({ SHARED_ACTIVE_ONLY: { processor: (v): string => String(v) } }, { name: "conflict-active" });`,
    )
    await write(
      "features/conflict-inactive/env.schema.ts",
      `const schema = { SHARED_ACTIVE_ONLY: { processor: (v): boolean => Boolean(v) } };
      export const conflictInactiveEnv = createEnv(schema, { name: "conflict-inactive" });
      documentEnv(schema, { active: false });`,
    )

    // No manifest/docs/usage/evidence requested -- only Finding Model's own
    // always-computed `activeContracts` filter (generate-env-artifacts.ts,
    // distinct from computeManifest()'s own internal one) is exercised here.
    const result = await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      include: [
        "features/payments/**/env.schema.ts",
        "features/conflict-active/**/env.schema.ts",
        "features/conflict-inactive/**/env.schema.ts",
      ],
    })

    const violations = result.evidence.finding.findings.filter(
      (f) => f.code === "PROCESSOR_RETURN_TYPE_CONFLICT",
    )
    expect(violations).toHaveLength(0)
  })

  it("docs.expiringWithinDays overrides the DEFAULT_EXPIRING_WITHIN_DAYS window everywhere it's threaded -- Lifecycle Model, Finding Model, and the written docs file", async () => {
    // 45 days out: outside the DEFAULT_EXPIRING_WITHIN_DAYS (30) window, but
    // inside the custom 60-day window this test requests -- so every
    // consumer of `expiringWithinDays` must actually use the override, not
    // silently fall back to the default, to see this variable as expiring.
    const nearFutureIsoDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    await write(
      "features/expiring/env.schema.ts",
      `const schema = { EXPIRING_KEY: {} };
      export const expiringEnv = createEnv(schema, { name: "expiring" });
      documentEnv(schema, {
        owner: "team",
        variables: { EXPIRING_KEY: { description: "d", expiresAt: "${nearFutureIsoDate}" } },
      });`,
    )

    const result = await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      include: ["features/expiring/**/env.schema.ts"],
      docs: { location: "docs/expiring.ENVIRONMENT.md", expiringWithinDays: 60 },
    })

    expect(result.evidence.lifecycle.expiring).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "EXPIRING_KEY" })]),
    )
    expect(
      result.evidence.finding.findings.some(
        (f) =>
          f.code === "EXPIRING_SOON" &&
          "variable" in f.location &&
          f.location.variable === "EXPIRING_KEY",
      ),
    ).toBe(true)

    const docsSource = await fs.readFile(result.docs!.docsPath, "utf8")
    expect(docsSource).toContain("60")
  })

  it("Change Model's manifest change report is exactly empty (every field a real empty array, not a poisoned one) when no evidence pass is requested", async () => {
    const result = await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      manifest: { location: "src/generated/no-evidence.manifest.ts" },
    })

    expect(result.evidence.change.manifest).toEqual({
      addedContracts: [],
      removedContracts: [],
      addedVariables: [],
      removedVariables: [],
      updatedContracts: [],
      updatedVariables: [],
    })
  })

  it("the evidence artifact's provenance carries a real generatedAt/toolVersion, not an empty stand-in", async () => {
    const before = new Date()
    const result = await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      manifest: { location: "src/generated/provenance.manifest.ts" },
    })

    expect(new Date(result.evidence.provenance.generatedAt).getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    )
    expect(result.evidence.provenance.toolVersion).toEqual(expect.any(String))
    expect(result.evidence.provenance.toolVersion.length).toBeGreaterThan(0)
  })

  it("a link-time parse warning reaches both the manifest and docs results' parseWarnings", async () => {
    await write(
      "features/unresolvable/env.schema.ts",
      `export const dynamicEnv = createEnv(someFactory(), { name: "dynamic" });`,
    )

    const result = await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      include: ["features/payments/**/env.schema.ts", "features/unresolvable/**/env.schema.ts"],
      manifest: { location: "src/generated/warning.manifest.ts" },
      docs: { location: "docs/warning.ENVIRONMENT.md" },
    })

    expect(
      result.manifest!.parseWarnings.some((w) =>
        w.message.includes("does not pass an inline object literal"),
      ),
    ).toBe(true)
    expect(
      result.docs!.parseWarnings.some((w) =>
        w.message.includes("does not pass an inline object literal"),
      ),
    ).toBe(true)
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
        fs: nodeBuildFs,
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
      fs: nodeBuildFs,
      root: fixtureRoot,
      manifest: { location: "../escaped-project-manifest.ts" },
      docs: { location: "../escaped-project-docs.md" },
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(EnvProjectGenerationError)
    const issues = (error as EnvProjectGenerationError).issues
    expect(issues).toHaveLength(2)
    expect(issues.map((i) => i.variable).sort()).toEqual(["docs.location", "manifest.location"])
    for (const issue of issues) expect(issue.reason).toContain("generateEnvArtifacts()")

    await expect(fs.access(outsideManifest)).rejects.toThrow()
    await expect(fs.access(outsideDocs)).rejects.toThrow()
  })

  it("rejects an escaping docs.envExample.location, distinct from an escaping docs.location itself", async () => {
    const outside = path.resolve(fixtureRoot, "..", "escaped-env-example.env.example")
    await fs.rm(outside, { force: true })

    const error = await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      docs: {
        location: "docs/ENVIRONMENT.md",
        envExample: { location: "../escaped-env-example.env.example" },
      },
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(EnvProjectGenerationError)
    expect((error as EnvProjectGenerationError).issues[0]?.variable).toBe(
      "docs.envExample.location",
    )
    expect((error as EnvProjectGenerationError).issues[0]?.reason).toContain(
      "generateEnvArtifacts()",
    )
    await expect(fs.access(outside)).rejects.toThrow()
    await expect(fs.access(path.resolve(fixtureRoot, "docs/ENVIRONMENT.md"))).rejects.toThrow()
  })

  it("defaults root to process.cwd() when omitted", async () => {
    // A real `process.chdir()` (tried first) throws `ERR_WORKER_UNSUPPORTED_OPERATION`
    // under any worker-thread-based test runner (Stryker's own vitest-runner
    // included, unlike this project's default `vitest run` pool) -- a Node.js
    // platform restriction, not a vitest quirk. Mocking `process.cwd()` itself
    // proves the same "root defaults to cwd" behavior without touching real
    // process-wide state at all.
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(fixtureRoot)
    try {
      const result = await generateEnvArtifacts({
        fs: nodeBuildFs,
        manifest: { location: "src/generated/cwd-default.manifest.ts" },
      })
      expect(result.manifest?.contracts.length).toBeGreaterThan(0)
    } finally {
      cwdSpy.mockRestore()
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
        fs: nodeBuildFs,
        root: fixtureRoot,
        include: ["features/live/**/env.schema.ts"],
        manifest: { location: "src/generated/live.manifest.ts" },
        docs: { location: "docs/live.ENVIRONMENT.md" },
        usage: { report: { location: "docs/live.OWNERSHIP.md" } },
        liveExpirationDates,
      })
      expect(liveExpirationDates).toHaveBeenCalledTimes(1)
    })

    it("is still invoked exactly once when docs is false or omitted, since Lifecycle Model (always built, ADR 0038) reads it too", async () => {
      const liveExpirationDates = vi.fn().mockResolvedValue({})
      await generateEnvArtifacts({
        fs: nodeBuildFs,
        root: fixtureRoot,
        include: ["features/live/**/env.schema.ts"],
        manifest: { location: "src/generated/live-no-docs.manifest.ts" },
        liveExpirationDates,
      })
      expect(liveExpirationDates).toHaveBeenCalledTimes(1)
    })

    it("does not affect the manifest pass's written output", async () => {
      const withoutOverride = await generateEnvArtifacts({
        fs: nodeBuildFs,
        root: fixtureRoot,
        include: ["features/live/**/env.schema.ts"],
        manifest: { location: "src/generated/live-manifest-a.manifest.ts" },
        docs: { location: "docs/live-manifest-a.ENVIRONMENT.md" },
      })
      const withOverride = await generateEnvArtifacts({
        fs: nodeBuildFs,
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
        fs: nodeBuildFs,
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
        fs: nodeBuildFs,
        root: fixtureRoot,
        manifest: { location: "src/generated/combined.manifest.ts" },
        docs: { location: "docs/combined.ENVIRONMENT.md" },
        usage: { report: { location: "docs/combined.OWNERSHIP.md" } },
      })

      expect(result.manifest!.contracts).toHaveLength(1)
      expect(result.docs!.contracts).toHaveLength(1)
      expect(result.usage!.dependencyOwnership).toHaveLength(1)
    })

    it("usage: {} with no report requested computes the usage pass but writes nothing", async () => {
      const result = await generateEnvArtifacts({ fs: nodeBuildFs, root: fixtureRoot, usage: {} })

      expect(result.usage).toBeDefined()
      expect(result.usage!.reportPath).toBeUndefined()
      expect(result.usage!.dependencyOwnership).toHaveLength(1)
    })

    it("rejects an escaping usage.report.location alongside otherwise-valid manifest/docs locations, atomically", async () => {
      const outsideOwnership = path.resolve(fixtureRoot, "..", "escaped-ownership.md")
      await fs.rm(outsideOwnership, { force: true })
      const manifestLocation = path.resolve(fixtureRoot, "src/generated/usage-escape.manifest.ts")
      await fs.rm(manifestLocation, { force: true })

      const error = await generateEnvArtifacts({
        fs: nodeBuildFs,
        root: fixtureRoot,
        manifest: { location: "src/generated/usage-escape.manifest.ts" },
        usage: { report: { location: "../escaped-ownership.md" } },
      }).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(EnvProjectGenerationError)
      expect((error as EnvProjectGenerationError).issues[0]?.variable).toBe("usage.report.location")
      expect((error as EnvProjectGenerationError).issues[0]?.reason).toContain(
        "generateEnvArtifacts()",
      )
      await expect(fs.access(outsideOwnership)).rejects.toThrow()
      await expect(fs.access(manifestLocation)).rejects.toThrow()
    })
  })

  it("rejects an escaping evidence.location", async () => {
    const outside = path.resolve(fixtureRoot, "..", "escaped-evidence.evidence.json")
    await fs.rm(outside, { force: true })

    const error = await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      evidence: { location: "../escaped-evidence.evidence.json" },
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(EnvProjectGenerationError)
    expect((error as EnvProjectGenerationError).issues[0]?.variable).toBe("evidence.location")
    expect((error as EnvProjectGenerationError).issues[0]?.reason).toContain(
      "generateEnvArtifacts()",
    )
    await expect(fs.access(outside)).rejects.toThrow()
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
        fs: nodeBuildFs,
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
      generateEnvArtifacts({ fs: nodeBuildFs, root: fixtureRoot, manifest: { location: outside } }),
    ).rejects.toThrow(EnvProjectGenerationError)

    await expect(fs.access(outside)).rejects.toThrow()
  })
})

describe("generateEnvArtifacts -- the persisted evidence artifact (ADR 0038)", () => {
  it("evidence is always populated, even when options.evidence was never requested", async () => {
    const result = await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      manifest: { location: "src/generated/env.manifest.ts" },
    })
    expect(result.evidence.contract.contracts.length).toBeGreaterThan(0)
    expect(result.evidence.contract.contracts.some((c) => c.contractName === "payments")).toBe(true)
  })

  it("--evidence writes the artifact and a paired .fingerprint sidecar", async () => {
    const result = await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      manifest: { location: "src/generated/env.manifest.ts" },
      evidence: { location: "docs/env.evidence.json" },
    })

    const evidencePath = path.resolve(fixtureRoot, "docs/env.evidence.json")
    const written = JSON.parse(await fs.readFile(evidencePath, "utf8")) as typeof result.evidence
    expect(written.contract.contracts.length).toBe(result.evidence.contract.contracts.length)

    const fingerprint = await fs.readFile(`${evidencePath}.fingerprint`, "utf8")
    expect(fingerprint.trim()).toMatch(/^[0-9a-f]{64}$/)
  })

  it("works standalone -- no manifest/docs/usage requested, only the evidence artifact is written", async () => {
    const result = await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      evidence: { location: "docs/env.evidence.json" },
    })
    expect(result.manifest).toBeUndefined()
    expect(result.docs).toBeUndefined()
    expect(result.usage).toBeUndefined()
    expect(result.evidence.contract.contracts.length).toBeGreaterThan(0)

    await expect(
      fs.access(path.resolve(fixtureRoot, "docs/env.evidence.json")),
    ).resolves.toBeUndefined()
    await expect(fs.access(path.resolve(fixtureRoot, "src/generated"))).rejects.toThrow()
  })

  it("threads options.packages through to the write path's own fingerprint computation, unmodified", async () => {
    computeSourceFingerprintMock.mockClear()
    await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      evidence: { location: "docs/env.evidence.json" },
      packages: ["@fixtures/some-package"],
    })

    expect(computeSourceFingerprintMock).toHaveBeenCalledTimes(1)
    const call = computeSourceFingerprintMock.mock.calls[0]?.[0] as { packages?: unknown }
    expect(call.packages).toEqual(["@fixtures/some-package"])
  })

  it("defaults options.packages to an empty array at the write path's fingerprint computation, when omitted", async () => {
    computeSourceFingerprintMock.mockClear()
    await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      evidence: { location: "docs/env.evidence.json" },
    })

    const call = computeSourceFingerprintMock.mock.calls[0]?.[0] as { packages?: unknown }
    expect(call.packages).toEqual([])
  })

  it("--check is stable across repeated runs -- provenance.generatedAt never causes false drift", async () => {
    await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      evidence: { location: "docs/env.evidence.json" },
    })

    for (let i = 0; i < 2; i++) {
      const result = await checkEnvArtifacts({
        fs: nodeBuildFs,
        root: fixtureRoot,
        evidence: { location: "docs/env.evidence.json" },
      })
      const evidenceFinding = result.findings.find((f) => f.artifact === "evidence")
      expect(evidenceFinding?.status).toBe("ok")
    }
  })

  it("never imported from runtime/isomorphic code -- src/runtime/ and src/evidence/ never reference evidence-snapshot.js/evidence-cache.js", async () => {
    const projectRoot = path.resolve(here, "../..")
    const forbidden = ["evidence-snapshot", "evidence-cache", "assemble-project"]

    async function walk(dir: string): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      const files: string[] = []
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) files.push(...(await walk(full)))
        else if (entry.name.endsWith(".ts")) files.push(full)
      }
      return files
    }

    for (const dir of ["src/runtime", "src/evidence"]) {
      const files = await walk(path.join(projectRoot, dir))
      for (const file of files) {
        const content = await fs.readFile(file, "utf8")
        for (const name of forbidden) {
          expect(
            content,
            `${path.relative(projectRoot, file)} must not reference ${name}`,
          ).not.toContain(name)
        }
      }
    }
  })

  it("a stale dynamicAccess citation surfaces in the ownership report's staleOrMissingCitations, joined via the evidence baseline", async () => {
    await write("scripts/migrate.sh", "v1\n")
    await write(
      "features/cited/env.schema.ts",
      `import { createEnv, documentEnv } from "env-cap";
const schema = { CITED_KEY: {} };
export const citedEnv = createEnv(schema, { name: "cited" });
documentEnv(schema, { owner: "cited-team", variables: { CITED_KEY: { evidence: { dynamicAccess: ["scripts/migrate.sh:1:1"] } } } });
`,
    )
    // The contract itself must be imported somewhere for its variables to
    // reach per-variable unconsumed/asserted analysis at all
    // (deriveOwnershipFindings() short-circuits an un-imported contract
    // straight to "abandoned") -- deliberately never touching CITED_KEY
    // itself (not even a bare reference like `void citedEnv` -- since ADR
    // 0039, that would itself be an escape site and produce "indeterminate"
    // instead), so its own access status stays "unconsumed".
    await write(
      "src/cited-consumer.ts",
      `import { citedEnv } from "../features/cited/env.schema.js";\n`,
    )

    const evidenceOptions = { location: "docs/env.evidence.json" }
    // First run: commits the baseline (CITED_KEY reads as "asserted", not "unconsumed", since the citation is fresh).
    const first = await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      evidence: evidenceOptions,
      usage: { report: { location: "docs/OWNERSHIP.md" } },
    })
    expect(
      first.usage!.asserted.some((a) => a.key === "CITED_KEY" && a.wouldBeStatus === "unconsumed"),
    ).toBe(true)

    // The cited file changes with no re-acknowledgment -- the citation goes stale.
    await write("scripts/migrate.sh", "v2 -- more code\n")

    const second = await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      evidence: evidenceOptions,
      usage: { report: { location: "docs/OWNERSHIP.md" } },
    })
    const citedFinding = second.usage!.unconsumedOwnedVariables.find((f) => f.key === "CITED_KEY")
    expect(citedFinding?.staleOrMissingCitations).toEqual([
      expect.objectContaining({
        key: "CITED_KEY",
        acknowledgment: "stale",
        position: { file: "scripts/migrate.sh", line: 1, column: 1 },
      }),
    ])

    const reportSource = await fs.readFile(path.resolve(fixtureRoot, "docs/OWNERSHIP.md"), "utf8")
    expect(reportSource).toContain("scripts/migrate.sh:1:1 (stale)")

    // The same stale-citation problem also reaches Finding Model through its
    // own `dynamicAccessCitationProblems` input -- fed from
    // `evidenceChanges?.dynamicAccessCitationProblems`, distinct from the
    // usage-report path already asserted on above.
    expect(
      second.evidence.finding.findings.some(
        (f) =>
          f.code === "STALE_DYNAMIC_ACCESS_CITATION" &&
          "variable" in f.location &&
          f.location.variable === "CITED_KEY",
      ),
    ).toBe(true)
  })
})
