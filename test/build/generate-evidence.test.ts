import { nodeBuildFs } from "../support/build-filesystem.js"
import { existsSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildContractModel } from "../../src/build/contract-model.js"
import { discoverSchemaFiles } from "../../src/build/discover.js"
import { EVIDENCE_MODEL_SCHEMA_VERSION } from "../../src/build/evidence-model.js"
import { generateEvidenceModel } from "../../src/build/generate-evidence.js"
import type { GenerateEvidenceModelOptions } from "../../src/build/generate-evidence.js"
import type { EvidenceModel } from "../../src/build/evidence-model.js"
import { linkFiles } from "../../src/build/link.js"
import { buildOwnershipModel } from "../../src/build/ownership-model.js"
import type { ImportResolutionContext } from "../../src/build/resolution/resolve-import.js"
import {
  mergeLocalAndPackageFiles,
  resolveAllowlistedPackages,
} from "../../src/build/resolution/resolve-package-schema.js"
import type { PackageSchemaResolutionResult } from "../../src/build/resolution/resolve-package-schema.js"
import {
  createAliasResolutionCache,
  loadTsconfigPaths,
} from "../../src/build/resolution/resolve-tsconfig-paths.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(here, "fixtures-generate-evidence")

async function write(relativePath: string, content: string): Promise<string> {
  const filePath = path.join(fixtureRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf8")
  return filePath
}

// Comfortably inside the default 30-day `expiringWithinDays` window, computed
// relative to the real clock so this fixture never rots into a false negative.
const nearFutureIsoDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

beforeEach(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
  await write(
    "features/payments/env.schema.ts",
    `const paymentsSchema = { STRIPE_KEY: {}, STRIPE_WEBHOOK_SECRET: {} };
    export const paymentsEnv = createEnv(paymentsSchema, { name: "payments" });
    documentEnv(paymentsSchema, {
      owner: "payments-team",
      variables: { STRIPE_KEY: { description: "Stripe secret key", expiresAt: "${nearFutureIsoDate}" } },
    });`,
  )
  await write(
    "features/legacy/env.schema.ts",
    `const legacySchema = { LEGACY_VAR: {} };
    export const legacyEnv = createEnv(legacySchema, { name: "legacy" });
    documentEnv(legacySchema, { owner: "legacy-team" });`,
  )
  await write(
    "src/server.ts",
    `import { paymentsEnv } from "../features/payments/env.schema.js";\npaymentsEnv.STRIPE_KEY;`,
  )
})

afterEach(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
})

describe("generateEvidenceModel", () => {
  it("returns a frozen, versioned model assembling all seven canonical facts", async () => {
    const evidence = await generateEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot })

    expect(evidence.schemaVersion).toBe(EVIDENCE_MODEL_SCHEMA_VERSION)
    expect(Object.isFrozen(evidence)).toBe(true)
    expect(Object.isFrozen(evidence.contract)).toBe(true)
    expect(Object.isFrozen(evidence.contract.contracts[0])).toBe(true)
    expect(() => {
      ;(evidence as { schemaVersion: number }).schemaVersion = 99
    }).toThrow(TypeError)
  })

  it("stamps provenance: generatedAt is fresh, toolVersion matches package.json, commit is undefined by default", async () => {
    const packageJson = JSON.parse(
      await fs.readFile(path.resolve(here, "../../package.json"), "utf8"),
    ) as { version: string }
    const before = Date.now()
    const evidence = await generateEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot })
    const after = Date.now()

    expect(evidence.provenance.toolVersion).toBe(packageJson.version)
    expect(evidence.provenance.commit).toBeUndefined()
    const generatedAtMs = new Date(evidence.provenance.generatedAt).getTime()
    expect(generatedAtMs).toBeGreaterThanOrEqual(before)
    expect(generatedAtMs).toBeLessThanOrEqual(after)
  })

  it("invokes the caller-supplied commit callback exactly once and stamps its result", async () => {
    let calls = 0
    const evidence = await generateEvidenceModel({
      fs: nodeBuildFs,
      root: fixtureRoot,
      commit: async () => {
        calls++
        return "abc1234"
      },
    })
    expect(calls).toBe(1)
    expect(evidence.provenance.commit).toBe("abc1234")
  })

  it("Contract Model and Ownership Model match calling their own builders directly against the same discovery/linking result", async () => {
    const localSchemaFiles = await discoverSchemaFiles({
      fs: nodeBuildFs,
      root: fixtureRoot,
      include: ["**/env.schema.ts"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
    })
    const packageCache = new Map<string, Promise<PackageSchemaResolutionResult>>()
    const { files: packageFiles, origins } = await resolveAllowlistedPackages(
      [],
      fixtureRoot,
      packageCache,
      nodeBuildFs,
    )
    const schemaFiles = await mergeLocalAndPackageFiles(
      localSchemaFiles,
      packageFiles.map((f) => f.file),
      nodeBuildFs,
    )
    const { resolution: tsconfigPaths } = await loadTsconfigPaths(
      fixtureRoot,
      undefined,
      nodeBuildFs,
    )
    const context: ImportResolutionContext = {
      fs: nodeBuildFs,
      root: fixtureRoot,
      packages: [],
      cache: packageCache,
      tsconfigPaths,
      aliasCache: createAliasResolutionCache(),
    }
    const linkResult = await linkFiles(
      schemaFiles,
      (filePath) => fs.readFile(filePath, "utf8"),
      context,
      origins,
    )
    const expectedContract = buildContractModel(linkResult.contracts, fixtureRoot)
    const expectedOwnership = buildOwnershipModel(linkResult.contracts, fixtureRoot)

    const evidence = await generateEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot })

    expect(evidence.contract).toEqual(expectedContract)
    expect(evidence.ownership).toEqual(expectedOwnership)
  })

  it("Dependency Model reflects real usage: STRIPE_KEY used, STRIPE_WEBHOOK_SECRET unconsumed", async () => {
    const evidence = await generateEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot })
    const payments = evidence.dependency.contracts.find((c) => c.exportName === "paymentsEnv")
    expect(payments?.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "STRIPE_KEY", status: "used" }),
        expect.objectContaining({ key: "STRIPE_WEBHOOK_SECRET", status: "unconsumed" }),
      ]),
    )
  })

  it("Lifecycle Model surfaces STRIPE_KEY's near-future expiresAt as an expiring entry", async () => {
    const evidence = await generateEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot })
    expect(evidence.lifecycle.expiring).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "STRIPE_KEY" })]),
    )
  })

  it("liveExpirationDates overrides Lifecycle Model's expiresAt, leaving Contract Model's static value untouched", async () => {
    const overrideDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const evidence = await generateEvidenceModel({
      fs: nodeBuildFs,
      root: fixtureRoot,
      liveExpirationDates: async () => ({ STRIPE_KEY: overrideDate }),
    })
    const lifecycleVariable = evidence.lifecycle.contracts
      .find((c) => c.exportName === "paymentsEnv")
      ?.variables.find((v) => v.key === "STRIPE_KEY")
    expect(lifecycleVariable?.expiresAt).toBe(overrideDate)

    const contractVariable = evidence.contract.contracts
      .find((c) => c.exportName === "paymentsEnv")
      ?.variables.find((v) => v.key === "STRIPE_KEY")
    expect(contractVariable?.expiresAt).toBe(nearFutureIsoDate)
  })

  it("Finding Model surfaces the abandoned contract, the unconsumed owned variable, and the undocumented variable", async () => {
    const evidence = await generateEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot })
    const codes = evidence.finding.findings.map((f) => f.code)
    expect(codes).toContain("ABANDONED_CONTRACT")
    expect(codes).toContain("UNCONSUMED_OWNED_VARIABLE")
    expect(codes).toContain("UNDOCUMENTED_VARIABLE")
  })

  it("Change Model has every field as a genuinely empty array, not undefined/missing, when no previousSnapshotLocation is given at all", async () => {
    const evidence = await generateEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot })
    expect(evidence.change.manifest).toEqual({
      addedContracts: [],
      removedContracts: [],
      addedVariables: [],
      removedVariables: [],
      updatedContracts: [],
      updatedVariables: [],
    })
    expect(evidence.change.renamedVariables).toEqual([])
  })

  it("Change Model treats a first run (no prior snapshot) as every active contract being added", async () => {
    const evidence = await generateEvidenceModel({
      fs: nodeBuildFs,
      root: fixtureRoot,
      previousSnapshotLocation: "docs/env.evidence.json",
    })
    const addedNames = evidence.change.manifest.addedContracts.map((c) => c.exportName).sort()
    expect(addedNames).toEqual(["legacyEnv", "paymentsEnv"])
  })

  it("Finding Model's exclusiveGroup check only considers ACTIVE contracts -- two ACTIVE contracts sharing a group IS flagged, an inactive one sharing a group is NOT", async () => {
    // Three contracts sharing "database": two ACTIVE (a real violation --
    // must survive `activeContracts` filtering down to just the active
    // set, or an over-eager filter that drops everything would silently
    // lose this finding) and one INACTIVE (must never itself contribute to
    // a violation, the "safe to leave declared" case the filter exists
    // for).
    await write(
      "features/db-a/env.schema.ts",
      `const dbASchema = { DATABASE_URL: {} };
      export const dbAEnv = createEnv(dbASchema, { name: "db-a" });
      documentEnv(dbASchema, { owner: "platform-team", exclusiveGroup: "database", active: true });`,
    )
    await write(
      "features/db-b/env.schema.ts",
      `const dbBSchema = { DATABASE_URL: {} };
      export const dbBEnv = createEnv(dbBSchema, { name: "db-b" });
      documentEnv(dbBSchema, { owner: "platform-team", exclusiveGroup: "database", active: true });`,
    )
    await write(
      "features/db-c/env.schema.ts",
      `const dbCSchema = { DATABASE_URL: {} };
      export const dbCEnv = createEnv(dbCSchema, { name: "db-c" });
      documentEnv(dbCSchema, { owner: "platform-team", exclusiveGroup: "database", active: false });`,
    )
    const evidence = await generateEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot })
    const violations = evidence.finding.findings.filter(
      (f) => f.code === "EXCLUSIVE_GROUP_VIOLATION",
    )
    // Exactly one -- not the three pairwise violations (a-b, a-c, b-c) an
    // unfiltered "every contract counts as active" would produce.
    expect(violations).toHaveLength(1)
    expect(violations[0]?.message).toContain("db-a")
    expect(violations[0]?.message).toContain("db-b")
    expect(violations[0]?.message).not.toContain("db-c")
  })

  it("never surfaces a dynamicAccess-citation finding for an INACTIVE contract's variable -- citation verification only considers active contracts, same filter as the exclusiveGroup check above", async () => {
    // The cited file genuinely doesn't exist, so a real (unfiltered) check
    // of this variable would report it "missing" -- the only observable
    // proof the inactive contract's citation was never even looked at is
    // that no such finding appears at all.
    await write(
      "features/inactive/env.schema.ts",
      `const inactiveSchema = { GHOST_VAR: {} };
      export const inactiveEnv = createEnv(inactiveSchema, { name: "inactive" });
      documentEnv(inactiveSchema, {
        owner: "platform-team",
        active: false,
        variables: { GHOST_VAR: { evidence: { dynamicAccess: ["scripts/does-not-exist.sh:1:1"] } } },
      });`,
    )
    // Citation verification (and therefore the active-contracts filter this
    // test targets) only runs at all when a previousSnapshotLocation is
    // given -- see generate-evidence.ts's own `snapshotPath ? ... :
    // undefined` gate. A missing snapshot file is the normal first-run case
    // (evidence-snapshot.ts's own "reports 'missing' for a file that
    // doesn't exist" test).
    const evidence = await generateEvidenceModel({
      fs: nodeBuildFs,
      root: fixtureRoot,
      previousSnapshotLocation: "docs/env.evidence.json",
    })
    const citationFindings = evidence.finding.findings.filter(
      (f) =>
        f.code === "MISSING_DYNAMIC_ACCESS_CITATION" || f.code === "STALE_DYNAMIC_ACCESS_CITATION",
    )
    expect(citationFindings).toHaveLength(0)
  })

  it("throws EnvProjectGenerationError when previousSnapshotLocation escapes root, naming the option and the calling function", async () => {
    const { EnvProjectGenerationError } = await import("../../src/build/errors.js")
    try {
      await generateEvidenceModel({
        fs: nodeBuildFs,
        root: fixtureRoot,
        previousSnapshotLocation: "../../outside.ts",
      })
      expect.fail("should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(EnvProjectGenerationError)
      const { issues } = error as InstanceType<typeof EnvProjectGenerationError>
      expect(issues).toHaveLength(1)
      expect(issues[0]?.variable).toBe("previousSnapshotLocation")
      expect(issues[0]?.files).toEqual(["../../outside.ts"])
      expect(issues[0]?.reason).toContain('"previousSnapshotLocation"')
      expect(issues[0]?.reason).toContain("generateEvidenceModel()")
    }
  })

  it("does not throw for data-quality findings -- errors surface as Finding data, not exceptions", async () => {
    // The fixture's undocumented variable / abandoned contract / unconsumed
    // owned variable are all real findings (see the dedicated test above),
    // yet generation must still succeed -- see generate-evidence.ts's own
    // module doc comment for why this differs from the other four generators.
    await expect(
      generateEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot }),
    ).resolves.toBeDefined()
  })
})

const distEntry = path.resolve(here, "../../dist/build.js")
const distMissing = !existsSync(distEntry)

describe.skipIf(distMissing)(
  "generateEvidenceModel against the built dist/build.js (requires `npm run build`)",
  () => {
    // Regression test: tsup bundles the ./build entry point into one flat
    // dist/build.js directly under the package root, not dist/build/index.js
    // -- unlike ./cli and ./eslint-plugin, which each preserve their own
    // subdirectory. A relative-path lookup for env-cap's own package.json
    // (provenance.toolVersion) that only accounts for source's directory
    // depth resolves to the wrong location once bundled, and previously threw
    // ENOENT for every consumer of *any* env-cap/build export,
    // not just generateEvidenceModel() -- this must be exercised against the
    // real built file, not source, to actually catch that.
    it("resolves provenance.toolVersion without throwing", async () => {
      const built = (await import(distEntry)) as {
        generateEvidenceModel: (options: GenerateEvidenceModelOptions) => Promise<EvidenceModel>
      }
      const evidence = await built.generateEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot })
      expect(evidence.provenance.toolVersion).toMatch(/^\d+\.\d+\.\d+$/)
    })
  },
)
