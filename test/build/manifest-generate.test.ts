import { nodeBuildFs } from "../support/build-filesystem.js"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { generatedBanner } from "../../src/build/generated-banner.js"
import { fileURLToPath, pathToFileURL } from "node:url"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { EnvManifestGenerationError } from "../../src/build/errors.js"
import { generateEnvArtifacts } from "../../src/build/generate-env-artifacts.js"
import { computeManifest, generateEnvManifest } from "../../src/build/generate-manifest.js"
import type { DiscoveredContract, DiscoveredVariable, LinkResult } from "../../src/build/link.js"
import { validateEnv } from "../../src/runtime/validate.js"

function makeVariable(
  overrides: Partial<DiscoveredVariable> & { key: string },
): DiscoveredVariable {
  return {
    hasDefault: false,
    defaultValue: undefined,
    hasProcessor: false,
    processorSource: undefined,
    processorReturnType: undefined,
    hasValidator: false,
    validatorSource: undefined,
    context: undefined,
    description: undefined,
    owner: undefined,
    sensitivity: undefined,
    expiresAt: undefined,
    refreshInstructions: undefined,
    setupInstructions: undefined,
    required: undefined,
    deprecated: undefined,
    deprecatedReason: undefined,
    removeBy: undefined,
    renamedFrom: undefined,
    purpose: undefined,
    legalBasis: undefined,
    retention: undefined,
    dataResidency: undefined,
    auditRequired: undefined,
    metadata: undefined,
    evidence: undefined,
    documented: true,
    declaration: { file: "/repo/x/env.schema.ts", line: 1, column: 1 },
    ...overrides,
  }
}

function makeContract(
  overrides: Partial<DiscoveredContract> & {
    file: string
    exportName: string
    variables: DiscoveredVariable[]
  },
): DiscoveredContract {
  return {
    contractName: overrides.exportName,
    active: true,
    category: undefined,
    exclusiveGroup: undefined,
    owner: undefined,
    sensitivity: undefined,
    expiresAt: undefined,
    deprecated: undefined,
    deprecatedReason: undefined,
    purpose: undefined,
    legalBasis: undefined,
    retention: undefined,
    dataResidency: undefined,
    auditRequired: undefined,
    metadata: undefined,
    documented: true,
    declaration: { file: "/repo/x/env.schema.ts", line: 1, column: 1 },
    documentation: undefined,
    packageOrigin: undefined,
    ...overrides,
  }
}

function makeLinkResult(contracts: DiscoveredContract[]): LinkResult {
  return {
    contracts,
    warnings: [],
    unresolvedLinks: [],
    undocumentedContracts: [],
    undocumentedVariables: [],
    staleDocEntries: [],
  }
}

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, "../..")
const runtimeIndex = path.resolve(projectRoot, "src/runtime/index.ts")
const fixtureRoot = path.resolve(here, "fixtures-manifest-generate")

async function writeFixture(relativeDir: string, source: string): Promise<void> {
  const dir = path.join(fixtureRoot, relativeDir)
  await fs.mkdir(dir, { recursive: true })
  const specifier = path.relative(dir, runtimeIndex).split(path.sep).join("/").replace(/\.ts$/, "")
  const normalized = specifier.startsWith(".") ? specifier : `./${specifier}`
  const content = `import { createEnv, documentEnv } from "${normalized}";\n\n${source}\n`
  await fs.writeFile(path.join(dir, "env.schema.ts"), content, "utf8")
}

describe("generateEnvManifest (real filesystem, no code execution during generation)", () => {
  beforeAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true })

    await writeFixture(
      "features/payments",
      `const paymentsSchema = {
        STRIPE_KEY: {
          processor: (value): string => String(value ?? ""),
          validator: (value, rawEnv) => {
            if (rawEnv.PAYMENT_PROVIDER !== "stripe") return true;
            return value.length > 0 || "Stripe key is required.";
          },
        },
      };
      export const paymentsEnv = createEnv(paymentsSchema, { name: "payments" });
      documentEnv(paymentsSchema, { variables: { STRIPE_KEY: { description: "Stripe secret key" } } });`,
    )

    await writeFixture(
      "packages/database",
      `export const databaseEnv = createEnv(
        {
          PORT: {
            default: 3000,
            processor: (value): number => Number(value),
            validator: (value) => (value >= 1 && value <= 65535) || "PORT must be between 1 and 65535.",
          },
        },
        { name: "database" },
      );`,
    )
  })

  afterAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true })
  })

  it("discovers both contracts, writes a deterministic manifest, and round-trips through validateEnv", async () => {
    const result = await generateEnvManifest({
      fs: nodeBuildFs,
      root: fixtureRoot,
      location: "src/generated/env.manifest.ts",
    })

    expect(result.contracts).toHaveLength(2)
    expect(result.warnings).toHaveLength(0)
    expect(result.parseWarnings).toHaveLength(0)

    const manifestSource = await fs.readFile(result.outputPath, "utf8")
    expect(manifestSource).toContain(generatedBanner("ts"))
    expect(manifestSource).toContain("paymentsEnv")
    expect(manifestSource).toContain("databaseEnv")

    expect(result.contracts.find((c) => c.exportName === "paymentsEnv")?.documented).toBe(true)
    expect(result.contracts.find((c) => c.exportName === "databaseEnv")?.documented).toBe(false)

    const manifestModule = (await import(pathToFileURL(result.outputPath).href)) as {
      manifest: [{ STRIPE_KEY: string }, { PORT: number }]
    }
    expect(manifestModule.manifest).toHaveLength(2)

    await validateEnv({
      values: { PAYMENT_PROVIDER: "stripe", STRIPE_KEY: "sk_live_123", PORT: "8080" },
      manifest: manifestModule.manifest,
    })

    const [paymentsEnv, databaseEnv] = manifestModule.manifest
    expect(paymentsEnv.STRIPE_KEY).toBe("sk_live_123")
    expect(databaseEnv.PORT).toBe(8080)
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
      const result = await generateEnvManifest({
        fs: nodeBuildFs,
        location: "src/generated/cwd-default.manifest.ts",
      })
      expect(result.contracts).toHaveLength(2)
    } finally {
      cwdSpy.mockRestore()
    }
  })

  it("prunes node_modules/dist/.git by default, even though `exclude` is entirely omitted", async () => {
    // A syntactically-real, discoverable-if-not-pruned contract, deliberately
    // placed under each of the three default-excluded directory names --
    // proves `defaultExclude()`'s own literal patterns, not just that
    // *some* exclude list is applied.
    await writeFixture(
      "node_modules/stray-pkg",
      `export const strayNodeModulesEnv = createEnv({ X: {} }, { name: "stray-node-modules" });`,
    )
    await writeFixture(
      "dist/generated",
      `export const strayDistEnv = createEnv({ X: {} }, { name: "stray-dist" });`,
    )
    await writeFixture(
      ".git/hooks",
      `export const strayGitEnv = createEnv({ X: {} }, { name: "stray-git" });`,
    )

    const result = await generateEnvManifest({
      fs: nodeBuildFs,
      root: fixtureRoot,
      location: "src/generated/prune-default.manifest.ts",
    })

    expect(result.contracts.map((c) => c.contractName)).not.toContain("stray-node-modules")
    expect(result.contracts.map((c) => c.contractName)).not.toContain("stray-dist")
    expect(result.contracts.map((c) => c.contractName)).not.toContain("stray-git")
    expect(result.contracts).toHaveLength(2)
  })

  it("throws EnvManifestGenerationError and writes nothing when two processors declare conflicting return types", async () => {
    await writeFixture(
      "features/conflict-a",
      `export const conflictAEnv = createEnv({ SHARED_FLAG: { processor: (v): string => String(v) } });`,
    )
    await writeFixture(
      "features/conflict-b",
      `export const conflictBEnv = createEnv({ SHARED_FLAG: { processor: (v): boolean => Boolean(v) } });`,
    )

    const location = "src/generated/conflict.manifest.ts"
    await expect(
      generateEnvManifest({
        fs: nodeBuildFs,
        root: fixtureRoot,
        location,
        include: ["features/conflict-*/env.schema.ts"],
      }),
    ).rejects.toThrow(EnvManifestGenerationError)

    await expect(fs.access(path.resolve(fixtureRoot, location))).rejects.toThrow()
  })

  it("onIncompatibility: throw escalates an ordinary warning-severity issue too, not just provable errors", async () => {
    // Differing processor implementations with no return-type annotations are
    // only ever a "warning" (unprovable via static analysis alone) -- confirms
    // `onIncompatibility: throw` escalates *all* issues, not only the
    // always-blocking "error"-severity ones the conflicting-return-type test
    // above already covers.
    await writeFixture(
      "features/warn-a",
      `export const warnAEnv = createEnv({ SOFT_FLAG: { processor: (v) => String(v) } });`,
    )
    await writeFixture(
      "features/warn-b",
      `export const warnBEnv = createEnv({ SOFT_FLAG: { processor: (v) => v } });`,
    )

    const location = "src/generated/warn-throw.manifest.ts"
    await expect(
      generateEnvManifest({
        fs: nodeBuildFs,
        root: fixtureRoot,
        location,
        include: ["features/warn-*/env.schema.ts"],
        onIncompatibility: "throw",
      }),
    ).rejects.toThrow(EnvManifestGenerationError)

    await expect(fs.access(path.resolve(fixtureRoot, location))).rejects.toThrow()
  })

  it("is deterministic: re-running generation against the same files produces byte-identical output", async () => {
    const options = {
      fs: nodeBuildFs,
      root: fixtureRoot,
      location: "src/generated/full.manifest.ts",
      include: ["features/payments/**/env.schema.ts", "packages/database/**/env.schema.ts"],
    }

    const result1 = await generateEnvManifest(options)
    const result2 = await generateEnvManifest(options)

    const source1 = await fs.readFile(result1.outputPath, "utf8")
    const source2 = await fs.readFile(result2.outputPath, "utf8")
    expect(source1).toBe(source2)
  })

  it("throws EnvManifestGenerationError when two ACTIVE contracts share an exclusiveGroup", async () => {
    await writeFixture(
      "features/group-conflict-a",
      `const schema = { X: {} };
      export const groupConflictAEnv = createEnv(schema, { name: "group-a" });
      documentEnv(schema, { exclusiveGroup: "grp" });`,
    )
    await writeFixture(
      "features/group-conflict-b",
      `const schema = { X: {} };
      export const groupConflictBEnv = createEnv(schema, { name: "group-b" });
      documentEnv(schema, { exclusiveGroup: "grp" });`,
    )

    const location = "src/generated/group-conflict.manifest.ts"
    await expect(
      generateEnvManifest({
        fs: nodeBuildFs,
        root: fixtureRoot,
        location,
        include: ["features/group-conflict-*/env.schema.ts"],
      }),
    ).rejects.toThrow(EnvManifestGenerationError)

    await expect(fs.access(path.resolve(fixtureRoot, location))).rejects.toThrow()
  })

  it("excludes an inactive contract from the manifest, though both are still discovered/reported", async () => {
    await writeFixture(
      "features/db-active",
      `const schema = { DATABASE_URL: { processor: (v): string => String(v ?? "") } };
      export const dbActiveEnv = createEnv(schema, { name: "db-active" });
      documentEnv(schema, { category: "database", exclusiveGroup: "database" });`,
    )
    await writeFixture(
      "features/db-inactive",
      `const schema = { DATABASE_URL: { processor: (v): string => String(v ?? "") } };
      export const dbInactiveEnv = createEnv(schema, { name: "db-inactive" });
      documentEnv(schema, { category: "database", exclusiveGroup: "database", active: false });`,
    )

    const result = await generateEnvManifest({
      fs: nodeBuildFs,
      root: fixtureRoot,
      location: "src/generated/active-inactive.manifest.ts",
      include: ["features/db-active/**/env.schema.ts", "features/db-inactive/**/env.schema.ts"],
    })

    expect(result.contracts).toHaveLength(2)
    expect(result.contracts.find((c) => c.contractName === "db-active")?.active).toBe(true)
    expect(result.contracts.find((c) => c.contractName === "db-inactive")?.active).toBe(false)

    const manifestModule = (await import(pathToFileURL(result.outputPath).href)) as {
      manifest: [{ DATABASE_URL: string }]
    }
    expect(manifestModule.manifest).toHaveLength(1)
  })

  describe("evidence artifact change-tracking (ContractModel fields added/removed/updated since the last persisted snapshot -- see ADR 0038)", () => {
    // Uses generateEnvArtifacts(), not bare generateEvidenceModel(), so this
    // matches how a real project actually triggers this (its generate:env
    // script). envExample.onExisting: "skip" keeps that unrelated artifact
    // out of the picture across the three repeated calls below -- the
    // default "keep-sibling" would otherwise spam a fresh timestamped
    // sibling file on every call, which this scenario has no interest in.
    const dir = "features/changes-demo"
    const location = "src/generated/changes-demo.manifest.ts"
    const artifactsOptions = {
      fs: nodeBuildFs,
      root: fixtureRoot,
      include: [`${dir}/**/env.schema.ts`],
      manifest: { location },
      docs: {
        location: "docs/changes-demo.md",
        envExample: { location: ".env.example.changes-demo", onExisting: "skip" as const },
      },
      evidence: { location: "docs/changes-demo.evidence.json" },
    }

    it("reports everything as added on the first run, nothing on an unchanged second run, and field-level updates after a documentEnv() edit", async () => {
      await writeFixture(
        dir,
        `const schema = { WEBHOOK_URL: {} };
        export const changesDemoEnv = createEnv(schema, { name: "changes-demo" });
        documentEnv(schema, { owner: "team-a", variables: { WEBHOOK_URL: { description: "v1", owner: "team-a" } } });`,
      )

      const first = await generateEnvArtifacts(artifactsOptions)
      const firstChanges = first.evidence.change.manifest
      expect(firstChanges.addedContracts).toHaveLength(1)
      expect(firstChanges.addedContracts[0]?.exportName).toBe("changesDemoEnv")
      expect(firstChanges.addedVariables).toHaveLength(1)
      expect(firstChanges.addedVariables[0]?.key).toBe("WEBHOOK_URL")
      expect(firstChanges.updatedContracts).toHaveLength(0)
      expect(firstChanges.updatedVariables).toHaveLength(0)
      expect(firstChanges.removedContracts).toHaveLength(0)
      expect(firstChanges.removedVariables).toHaveLength(0)

      const evidencePath = path.resolve(fixtureRoot, "docs/changes-demo.evidence.json")
      await expect(fs.access(evidencePath)).resolves.toBeUndefined()
      await expect(fs.access(`${evidencePath}.fingerprint`)).resolves.toBeUndefined()

      // Second run against the exact same source: nothing changed at all.
      const second = await generateEnvArtifacts(artifactsOptions)
      const secondChanges = second.evidence.change.manifest
      expect(secondChanges.addedContracts).toHaveLength(0)
      expect(secondChanges.addedVariables).toHaveLength(0)
      expect(secondChanges.updatedContracts).toHaveLength(0)
      expect(secondChanges.updatedVariables).toHaveLength(0)
      expect(secondChanges.removedContracts).toHaveLength(0)
      expect(secondChanges.removedVariables).toHaveLength(0)

      // Third run: documentEnv() metadata edited (description and owner both change).
      await writeFixture(
        dir,
        `const schema = { WEBHOOK_URL: {} };
        export const changesDemoEnv = createEnv(schema, { name: "changes-demo" });
        documentEnv(schema, { owner: "team-a", variables: { WEBHOOK_URL: { description: "v2", owner: "team-b" } } });`,
      )

      const third = await generateEnvArtifacts(artifactsOptions)
      const thirdChanges = third.evidence.change.manifest
      expect(thirdChanges.addedContracts).toHaveLength(0)
      expect(thirdChanges.addedVariables).toHaveLength(0)
      expect(thirdChanges.removedContracts).toHaveLength(0)
      expect(thirdChanges.removedVariables).toHaveLength(0)
      expect(thirdChanges.updatedContracts).toHaveLength(0)
      expect(thirdChanges.updatedVariables).toHaveLength(1)

      const variableUpdate = thirdChanges.updatedVariables[0]! // asserted toHaveLength(1) just above
      expect(variableUpdate.key).toBe("WEBHOOK_URL")
      expect(variableUpdate.exportName).toBe("changesDemoEnv")
      expect(variableUpdate.changes).toEqual(
        expect.arrayContaining([
          { field: "description", previous: "v1", current: "v2" },
          { field: "owner", previous: "team-a", current: "team-b" },
        ]),
      )

      // onExisting: "skip" kept every call after the first from touching
      // .env.example.changes-demo again -- exactly one file, no timestamped
      // siblings, even though generation ran three times against it.
      const envExampleSiblings = (await fs.readdir(fixtureRoot)).filter((name) =>
        name.startsWith(".env.example.changes-demo"),
      )
      expect(envExampleSiblings).toEqual([".env.example.changes-demo"])
    })
  })

  it("omits any packages report entirely when options.packages is omitted -- exactly the one real (non-package) warning shows, no spurious `(package) ...` entry", async () => {
    // An unresolvable schema factory reference -- `link.ts` can't statically
    // evaluate `someFactory()`, so it emits a real parse warning, distinct
    // from any `(package) <name>` warning `resolveAllowlistedPackages()`
    // would emit for an unresolvable *package name*.
    await writeFixture("features/odd", `export const oddEnv = createEnv(someFactory());`)

    const result = await generateEnvManifest({
      fs: nodeBuildFs,
      root: fixtureRoot,
      location: "src/generated/odd.manifest.ts",
      include: ["features/odd/**/env.schema.ts"],
    })

    expect(result.parseWarnings).toHaveLength(1)
    expect(result.parseWarnings.some((w) => w.file.startsWith("(package)"))).toBe(false)
  })

  describe("output path safety", () => {
    it("still succeeds for a normally-nested output location (baseline)", async () => {
      const result = await generateEnvManifest({
        fs: nodeBuildFs,
        root: fixtureRoot,
        location: "deeply/nested/generated/env.manifest.ts",
        include: ["features/payments/**/env.schema.ts"],
      })
      expect(result.outputPath).toBe(
        path.resolve(fixtureRoot, "deeply/nested/generated/env.manifest.ts"),
      )
      await expect(fs.access(result.outputPath)).resolves.toBeUndefined()
    })

    it("rejects a relative `location` that escapes root via `..`, naming the offending option/function and carrying exactly one issue", async () => {
      const outside = path.resolve(fixtureRoot, "..", "escaped-manifest.ts")
      await fs.rm(outside, { force: true })

      let caught: unknown
      try {
        await generateEnvManifest({
          fs: nodeBuildFs,
          root: fixtureRoot,
          location: "../escaped-manifest.ts",
          include: ["features/payments/**/env.schema.ts"],
        })
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(EnvManifestGenerationError)
      const manifestError = caught as EnvManifestGenerationError
      expect(manifestError.issues).toHaveLength(1)
      expect(manifestError.issues[0]?.reason).toContain('"location"')
      expect(manifestError.issues[0]?.reason).toContain("generateEnvManifest()")

      await expect(fs.access(outside)).rejects.toThrow()
    })

    it("rejects an absolute `location` outside root", async () => {
      const outside = path.join(os.tmpdir(), `env-cap-manifest-escape-test-${Date.now()}.ts`)
      await fs.rm(outside, { force: true })

      await expect(
        generateEnvManifest({
          fs: nodeBuildFs,
          root: fixtureRoot,
          location: outside,
          include: ["features/payments/**/env.schema.ts"],
        }),
      ).rejects.toThrow(EnvManifestGenerationError)

      await expect(fs.access(outside)).rejects.toThrow()
    })
  })
})

describe("computeManifest (direct, pure -- no I/O)", () => {
  it("excludes an inactive contract from activeContracts, though contractSummaries still lists both", () => {
    const linkResult = makeLinkResult([
      makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        active: true,
        variables: [makeVariable({ key: "A_KEY" })],
      }),
      makeContract({
        file: "/repo/b/env.schema.ts",
        exportName: "bEnv",
        active: false,
        variables: [makeVariable({ key: "B_KEY" })],
      }),
    ])

    const computed = computeManifest("/repo", linkResult, "warn")
    expect(computed.activeContracts.map((c) => c.exportName)).toEqual(["aEnv"])
    expect(computed.contractSummaries).toHaveLength(2)
  })

  it("blocking under onIncompatibility: warn is only the error-severity issue, never the warning-severity one", () => {
    const linkResult = makeLinkResult([
      makeContract({
        file: "/repo/err-a/env.schema.ts",
        exportName: "errAEnv",
        variables: [makeVariable({ key: "ERR_KEY", processorReturnType: "string" })],
      }),
      makeContract({
        file: "/repo/err-b/env.schema.ts",
        exportName: "errBEnv",
        variables: [makeVariable({ key: "ERR_KEY", processorReturnType: "boolean" })],
      }),
      makeContract({
        file: "/repo/warn-a/env.schema.ts",
        exportName: "warnAEnv",
        variables: [
          makeVariable({ key: "WARN_KEY", hasProcessor: true, processorSource: "shapeA" }),
        ],
      }),
      makeContract({
        file: "/repo/warn-b/env.schema.ts",
        exportName: "warnBEnv",
        variables: [
          makeVariable({ key: "WARN_KEY", hasProcessor: true, processorSource: "shapeB" }),
        ],
      }),
    ])

    const computed = computeManifest("/repo", linkResult, "warn")
    expect(computed.blocking).toEqual([
      expect.objectContaining({ severity: "error", code: "PROCESSOR_RETURN_TYPE_CONFLICT" }),
    ])
    expect(computed.warnings).toEqual([
      expect.objectContaining({ severity: "warning", code: "PROCESSOR_SOURCE_CONFLICT" }),
    ])
  })

  it("blocking under onIncompatibility: throw escalates the warning too, but never the info-severity duplicate-shape observation", () => {
    const linkResult = makeLinkResult([
      makeContract({
        file: "/repo/warn-a/env.schema.ts",
        exportName: "warnAEnv",
        variables: [
          makeVariable({ key: "WARN_KEY", hasProcessor: true, processorSource: "shapeA" }),
        ],
      }),
      makeContract({
        file: "/repo/warn-b/env.schema.ts",
        exportName: "warnBEnv",
        variables: [
          makeVariable({ key: "WARN_KEY", hasProcessor: true, processorSource: "shapeB" }),
        ],
      }),
      // Two DIFFERENT keys, otherwise-identical shape (same declared
      // `processorReturnType`), across two different active/non-exclusive-
      // grouped contracts -- detectDuplicateVariableShapes()'s own "info"
      // trigger. NOTE: `shapesMatch()` explicitly treats "unknown" (a bare
      // variable with no processorReturnType/default) as NEVER matching
      // anything, including another "unknown" -- a matching PAIR needs a
      // real, shared, non-"unknown" valueType, not just two bare variables.
      makeContract({
        file: "/repo/info-a/env.schema.ts",
        exportName: "infoAEnv",
        variables: [makeVariable({ key: "INFO_KEY_A", processorReturnType: "string" })],
      }),
      makeContract({
        file: "/repo/info-b/env.schema.ts",
        exportName: "infoBEnv",
        variables: [makeVariable({ key: "INFO_KEY_B", processorReturnType: "string" })],
      }),
    ])

    const computed = computeManifest("/repo", linkResult, "throw")
    expect(computed.blocking).toEqual([
      expect.objectContaining({ severity: "warning", code: "PROCESSOR_SOURCE_CONFLICT" }),
    ])
  })
})
