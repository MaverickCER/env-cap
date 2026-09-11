import { nodeBuildFs } from "../support/build-filesystem.js"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { generatedBanner } from "../../src/build/generated-banner.js"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { dynamicAccessVariableIdentity } from "../../src/build/citation-verification.js"
import { discoverSchemaFiles } from "../../src/build/discover.js"
import { displayPath } from "../../src/build/display-path.js"
import { EnvUsageAnalysisError } from "../../src/build/errors.js"
import {
  computeScanSurface,
  computeUsage,
  generateUsageReport,
} from "../../src/build/generate-usage.js"
import { linkFiles } from "../../src/build/link.js"
import type { ImportResolutionContext } from "../../src/build/resolution/resolve-import.js"
import type {
  PackageOrigin,
  PackageSchemaResolutionResult,
} from "../../src/build/resolution/resolve-package-schema.js"
import type { DynamicAccessAssertion } from "../../src/build/source-position.js"
import { createAliasResolutionCache } from "../../src/build/resolution/resolve-tsconfig-paths.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(here, "fixtures-usage-generate")

async function write(relativePath: string, content: string): Promise<string> {
  const filePath = path.join(fixtureRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf8")
  return filePath
}

describe("generateUsageReport", () => {
  beforeAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true })

    await write(
      "features/payments/env.schema.ts",
      `const paymentsSchema = { STRIPE_KEY: {}, WEBHOOK_SECRET: {} };
      export const paymentsEnv = createEnv(paymentsSchema, { name: "payments" });
      documentEnv(paymentsSchema, { owner: "payments-team" });`,
    )
    await write(
      "features/orphaned/env.schema.ts",
      `const orphanedSchema = { OLD_KEY: {} };
      export const orphanedEnv = createEnv(orphanedSchema, { name: "orphaned" });
      documentEnv(orphanedSchema, { owner: "legacy-team" });`,
    )
    await write(
      "src/server.ts",
      `import { paymentsEnv } from "../features/payments/env.schema.js";\npaymentsEnv.STRIPE_KEY;`,
    )
    // .tsx-only file -- distinguishes the scan `include` glob's OWN
    // "**/*.tsx" entry from "**/*.ts" alone (a fixture with only .ts files
    // can never observe that pattern's own StringLiteral mutant).
    await write("src/widget.tsx", `export const Widget = () => null;\n`)
  })

  afterAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true })
  })

  it("maps the dependency graph into the ownership-framed public result, with owner/consumers, and no blastRadius field", async () => {
    const result = await generateUsageReport({ fs: nodeBuildFs, root: fixtureRoot })

    const payments = result.dependencyOwnership.find((e) => e.contractName === "payments")
    expect(payments?.owner).toBe("payments-team")
    expect(payments?.consumers).toEqual([
      path.relative(fixtureRoot, path.resolve(fixtureRoot, "src/server.ts")),
    ])
    expect(payments).not.toHaveProperty("blastRadius")

    expect(result.abandonedContracts).toEqual([
      expect.objectContaining({ contractName: "orphaned", owner: "legacy-team" }),
    ])
    expect(result.unconsumedOwnedVariables).toEqual([
      expect.objectContaining({ contractName: "payments", key: "WEBHOOK_SECRET" }),
    ])
  })

  it("never throws for an abandoned/unconsumed/unresolved/indeterminate ownership finding -- ownership hygiene is never a blocking concern (ADR 0038)", async () => {
    await expect(generateUsageReport({ fs: nodeBuildFs, root: fixtureRoot })).resolves.toBeDefined()
  })

  it("writes the Dependency & Ownership Report to disk when report.location is given", async () => {
    const result = await generateUsageReport({
      fs: nodeBuildFs,
      root: fixtureRoot,
      report: { location: "docs/OWNERSHIP.md" },
    })
    expect(result.reportPath).toBe(path.resolve(fixtureRoot, "docs/OWNERSHIP.md"))
    const source = await fs.readFile(result.reportPath!, "utf8")
    expect(source).toContain(generatedBanner("markdown"))
    expect(source).toContain("Dependency & Ownership Report")
    expect(source).toContain("payments-team")
  })

  it("does not write anything when report.location is omitted", async () => {
    const result = await generateUsageReport({ fs: nodeBuildFs, root: fixtureRoot })
    expect(result.reportPath).toBeUndefined()
  })

  it("compute/render/write are independently usable: computeUsage never touches the filesystem for writing", async () => {
    const context: ImportResolutionContext = {
      fs: nodeBuildFs,
      root: fixtureRoot,
      packages: [],
      cache: new Map<string, Promise<PackageSchemaResolutionResult>>(),
      tsconfigPaths: undefined,
      aliasCache: createAliasResolutionCache(),
    }
    const schemaFiles = await discoverSchemaFiles({
      fs: nodeBuildFs,
      root: fixtureRoot,
      include: ["**/env.schema.ts"],
      exclude: [],
    })
    const linkResult = await linkFiles(schemaFiles, (f) => fs.readFile(f, "utf8"), context)
    const scanFiles = await discoverSchemaFiles({
      fs: nodeBuildFs,
      root: fixtureRoot,
      include: ["**/*.ts"],
      exclude: [],
    })

    const computed = await computeUsage(
      fixtureRoot,
      linkResult.contracts,
      scanFiles,
      (f) => fs.readFile(f, "utf8"),
      context,
      linkResult.warnings,
    )
    expect(computed.result.dependencyOwnership.length).toBeGreaterThan(0)

    const notWrittenPath = path.resolve(fixtureRoot, "docs/should-not-exist.md")
    await expect(fs.access(notWrittenPath)).rejects.toThrow()
  })

  describe("output path safety", () => {
    it("rejects a relative report.location that escapes root via `..`, naming the offending option/function and carrying exactly one issue", async () => {
      const outside = path.resolve(fixtureRoot, "..", "escaped-ownership.md")
      await fs.rm(outside, { force: true })

      let caught: unknown
      try {
        await generateUsageReport({
          fs: nodeBuildFs,
          root: fixtureRoot,
          report: { location: "../escaped-ownership.md" },
        })
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(EnvUsageAnalysisError)
      const usageError = caught as EnvUsageAnalysisError
      expect(usageError.issues).toHaveLength(1)
      expect(usageError.issues[0]?.reason).toContain('"report.location"')
      expect(usageError.issues[0]?.reason).toContain("generateUsageReport()")

      await expect(fs.access(outside)).rejects.toThrow()
    })

    it("rejects an absolute report.location outside root", async () => {
      const outside = path.join(os.tmpdir(), `env-cap-ownership-escape-test-${Date.now()}.md`)
      await fs.rm(outside, { force: true })

      await expect(
        generateUsageReport({ fs: nodeBuildFs, root: fixtureRoot, report: { location: outside } }),
      ).rejects.toThrow(EnvUsageAnalysisError)

      await expect(fs.access(outside)).rejects.toThrow()
    })
  })

  it("is standalone self-sufficient: does its own discovery, no generateEnvArtifacts involved", async () => {
    const isolatedRoot = path.resolve(fixtureRoot, "features/payments")
    const result = await generateUsageReport({ fs: nodeBuildFs, root: isolatedRoot })
    expect(result.dependencyOwnership.some((e) => e.contractName === "payments")).toBe(true)
  })

  it("defaults root to process.cwd() when omitted", async () => {
    // A real `process.chdir()` (tried first) throws `ERR_WORKER_UNSUPPORTED_OPERATION`
    // under any worker-thread-based test runner (Stryker's own vitest-runner
    // included, unlike this project's default `vitest run` pool) -- a Node.js
    // platform restriction, not a vitest quirk. Mocking `process.cwd()` itself
    // proves the same "root defaults to cwd" behavior without touching real
    // process-wide state at all.
    const cwdSpy = vi
      .spyOn(process, "cwd")
      .mockReturnValue(path.resolve(fixtureRoot, "features/payments"))
    try {
      const result = await generateUsageReport({ fs: nodeBuildFs })
      expect(result.dependencyOwnership.some((e) => e.contractName === "payments")).toBe(true)
    } finally {
      cwdSpy.mockRestore()
    }
  })

  it("resolves an unconsumed variable's effective owner -- its own override, not just the contract's (regression, ADR 0028)", async () => {
    const ownerFallbackRoot = path.resolve(fixtureRoot, "owner-fallback")
    // TWO variables, declared in an order where the FIRST one (INVOICE_KEY)
    // is consumed (so never unconsumed) and the SECOND (LEDGER_KEY) is the
    // one that's actually unconsumed and owner-overridden -- if the lookup
    // ever picked the first-found variable instead of finding the one whose
    // `key` actually matches, it would wrongly report INVOICE_KEY's owner
    // (undefined, no override) instead of LEDGER_KEY's ("ledger-team").
    await write(
      "owner-fallback/features/billing/env.schema.ts",
      `const billingSchema = { INVOICE_KEY: {}, LEDGER_KEY: {} };
      export const billingEnv = createEnv(billingSchema, { name: "billing" });
      documentEnv(billingSchema, { variables: { LEDGER_KEY: { owner: "ledger-team" } } });`,
    )
    // Imports the contract (so it's not "abandoned") and accesses
    // INVOICE_KEY but never LEDGER_KEY (so only LEDGER_KEY is "unconsumed").
    // The contract declares no owner of its own -- only LEDGER_KEY does.
    await write(
      "owner-fallback/src/server.ts",
      `import { billingEnv } from "../features/billing/env.schema.js";\nbillingEnv.INVOICE_KEY;\n`,
    )

    const result = await generateUsageReport({ fs: nodeBuildFs, root: ownerFallbackRoot })
    expect(result.unconsumedOwnedVariables).toEqual([
      expect.objectContaining({
        contractName: "billing",
        key: "LEDGER_KEY",
        owner: "ledger-team",
      }),
    ])
  })

  it("maps unresolvedConsumers and indeterminate ownership findings into the public result shape", async () => {
    const ambiguousRoot = path.resolve(fixtureRoot, "ambiguous-findings")
    await write(
      "ambiguous-findings/features/billing/env.schema.ts",
      `const billingSchema = { INVOICE_KEY: {}, LEDGER_TOKEN: {} };
      export const billingEnv = createEnv(billingSchema, { name: "billing" });
      documentEnv(billingSchema, { owner: "billing-team" });`,
    )
    // Only reachable through an unresolved `export * from` barrel -- must
    // land in unresolvedConsumers, never abandoned.
    await write("ambiguous-findings/features/billing/index.ts", `export * from "./env.schema.js";`)
    await write(
      "ambiguous-findings/src/barrel-consumer.ts",
      `import { billingEnv } from "../features/billing/index.js";\nbillingEnv.INVOICE_KEY;`,
    )
    // Computed access on a second, directly-imported contract forces its
    // otherwise-unread variable to "indeterminate", never "unconsumed".
    await write(
      "ambiguous-findings/features/payroll/env.schema.ts",
      `const payrollSchema = { SALARY_KEY: {}, BONUS_KEY: {} };
      export const payrollEnv = createEnv(payrollSchema, { name: "payroll" });
      documentEnv(payrollSchema, { owner: "payroll-team" });`,
    )
    await write(
      "ambiguous-findings/src/dynamic-consumer.ts",
      `import { payrollEnv } from "../features/payroll/env.schema.js";
      const key = "SALARY_KEY";
      payrollEnv.SALARY_KEY;
      payrollEnv[key];`,
    )

    const result = await generateUsageReport({ fs: nodeBuildFs, root: ambiguousRoot })

    expect(result.unresolvedConsumers).toEqual([
      expect.objectContaining({ contractName: "billing" }),
    ])
    // Also pins `dynamicAccessSites`' own mapping (root-relative `file`,
    // real `line`/`column`) -- not just the finding's contractName/key --
    // since `payrollEnv[key]` is the one dynamic-access site in this fixture.
    expect(result.indeterminate).toEqual([
      expect.objectContaining({
        contractName: "payroll",
        key: "BONUS_KEY",
        dynamicAccessSites: [
          expect.objectContaining({
            file: path.relative(
              ambiguousRoot,
              path.resolve(ambiguousRoot, "src/dynamic-consumer.ts"),
            ),
          }),
        ],
      }),
    ])
  })

  it("omits any packages report entirely when options.packages is omitted -- exactly the one real (non-package) warning shows, no spurious `(package) ...` entry", async () => {
    const warningRoot = path.resolve(fixtureRoot, "warning-only")
    // An unresolvable schema factory reference -- `link.ts` can't statically
    // evaluate `someFactory()`, so it emits a real parse warning, distinct
    // from any `(package) <name>` warning `resolveAllowlistedPackages()`
    // would emit for an unresolvable *package name*.
    await write(
      "warning-only/features/odd/env.schema.ts",
      `export const oddEnv = createEnv(someFactory(), { name: "odd" });`,
    )

    const result = await generateUsageReport({ fs: nodeBuildFs, root: warningRoot })

    expect(result.parseWarnings).toHaveLength(1)
    expect(result.parseWarnings.some((w) => w.file.startsWith("(package)"))).toBe(false)
  })

  describe("computeUsage -- stale/missing dynamic-access citations", () => {
    const citationsRoot = path.resolve(fixtureRoot, "citations")

    beforeAll(async () => {
      await write(
        "citations/features/billing/env.schema.ts",
        `const billingSchema = { INVOICE_KEY: {} };
        export const billingEnv = createEnv(billingSchema, { name: "billing" });
        documentEnv(billingSchema, { owner: "billing-team" });`,
      )
      // Imported (so the contract isn't "abandoned") but never referenced
      // past the import at all, and INVOICE_KEY itself is never
      // member-accessed -- lands in unconsumedOwned, the one finding type
      // `staleOrMissingCitationsFor` is reached through here. (Deliberately
      // NOT a bare reference like `console.log(billingEnv)` -- since ADR
      // 0039, that would itself be an escape site and produce
      // "indeterminate" instead of "unconsumed".)
      await write(
        "citations/src/server.ts",
        `import { billingEnv } from "../features/billing/env.schema.js";\n`,
      )
    })

    async function computeFor(acknowledgments?: Map<string, DynamicAccessAssertion[]>) {
      const context: ImportResolutionContext = {
        fs: nodeBuildFs,
        root: citationsRoot,
        packages: [],
        cache: new Map<string, Promise<PackageSchemaResolutionResult>>(),
        tsconfigPaths: undefined,
        aliasCache: createAliasResolutionCache(),
      }
      const schemaFiles = await discoverSchemaFiles({
        fs: nodeBuildFs,
        root: citationsRoot,
        include: ["**/env.schema.ts"],
        exclude: [],
      })
      const linkResult = await linkFiles(schemaFiles, (f) => fs.readFile(f, "utf8"), context)
      const scanFiles = await discoverSchemaFiles({
        fs: nodeBuildFs,
        root: citationsRoot,
        include: ["**/*.ts"],
        exclude: [],
      })
      return computeUsage(
        citationsRoot,
        linkResult.contracts,
        scanFiles,
        (f) => fs.readFile(f, "utf8"),
        context,
        linkResult.warnings,
        undefined,
        acknowledgments,
      )
    }

    it("is exactly [] when no acknowledgments map is passed at all", async () => {
      const computed = await computeFor(undefined)
      expect(computed.result.unconsumedOwnedVariables).toEqual([
        expect.objectContaining({ contractName: "billing", key: "INVOICE_KEY" }),
      ])
      expect(computed.result.unconsumedOwnedVariables[0]?.staleOrMissingCitations).toEqual([])
    })

    it("maps a real 'stale'/'missing' acknowledgment into an exact staleOrMissingCitations entry", async () => {
      // NOTE: a "fresh" entry can never coexist here with a real
      // unconsumedOwned finding -- see the note on `staleOrMissingCitationsFor`
      // in the source: `deriveOwnershipFindings()` promotes ANY variable with
      // a "fresh" assertion to the separate "asserted" finding bucket
      // *before* it would ever reach `unconsumedOwned`/`indeterminate`, using
      // this exact same identity-keyed map -- so a "fresh"-and-"stale" mix
      // for one variable is unreachable from this call site.
      const identity = dynamicAccessVariableIdentity(
        displayPath(citationsRoot, path.resolve(citationsRoot, "features/billing/env.schema.ts")),
        "billingEnv",
        "INVOICE_KEY",
      )
      const acknowledgments = new Map<string, DynamicAccessAssertion[]>([
        [
          identity,
          [
            {
              file: "src/legacy-b.ts",
              line: 7,
              column: 9,
              acknowledgment: "stale",
              contentHash: "bbb",
            },
          ],
        ],
      ])

      const computed = await computeFor(acknowledgments)
      expect(computed.result.unconsumedOwnedVariables[0]?.staleOrMissingCitations).toEqual([
        {
          contractName: "billing",
          file: displayPath(
            citationsRoot,
            path.resolve(citationsRoot, "features/billing/env.schema.ts"),
          ),
          exportName: "billingEnv",
          key: "INVOICE_KEY",
          position: { file: "src/legacy-b.ts", line: 7, column: 9 },
          acknowledgment: "stale",
        },
      ])
    })
  })

  describe("computeScanSurface (direct)", () => {
    // Deliberately OUTSIDE fixtureRoot (a sibling directory, never nested
    // under it) -- a package dir nested inside the scanned root would be
    // picked up by the LOCAL scan too, making the package-specific scan
    // branch's own `include`/`exclude` unobservable (a real bug caught only
    // by hand-mutating `include: []` and seeing the test pass unchanged).
    const packageRoot = path.resolve(here, "fixtures-usage-generate-package")
    const packageDirA = path.join(packageRoot, "package-a")
    const packageDirB = path.join(packageRoot, "package-b")

    beforeAll(async () => {
      await fs.rm(packageRoot, { recursive: true, force: true })
      for (const dir of [packageDirA, packageDirB]) {
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(
          path.join(dir, "env.schema.ts"),
          `export const vendorSchema = { VENDOR_KEY: {} };\nconsumeIt(vendorSchema);\n`,
          "utf8",
        )
        await fs.writeFile(path.join(dir, "consumer.ts"), `vendorSchema.VENDOR_KEY;\n`, "utf8")
      }
    })

    afterAll(async () => {
      await fs.rm(packageRoot, { recursive: true, force: true })
    })

    function origin(packageName: string, packageDir: string): PackageOrigin {
      return {
        packageName,
        declaredField: "envCap.schema",
        resolvedFile: path.join(packageDir, "env.schema.ts"),
        packageDir,
      }
    }

    it("returns just the application surface when no package origins are given -- including a .tsx-only file", async () => {
      const { scannedSurfaces, scanFiles } = await computeScanSurface(
        fixtureRoot,
        [],
        new Map(),
        nodeBuildFs,
      )
      expect(scannedSurfaces).toEqual([{ label: "application", root: "." }])
      expect(scanFiles).toEqual(
        expect.arrayContaining([
          path.resolve(fixtureRoot, "src/server.ts"),
          path.resolve(fixtureRoot, "src/widget.tsx"),
        ]),
      )
      expect(scanFiles).not.toEqual(expect.arrayContaining([path.join(packageDirA, "consumer.ts")]))
    })

    it("adds a package: surface (and scans its files, via its own include/exclude, .tsx included) for each resolved package origin", async () => {
      await fs.writeFile(
        path.join(packageDirA, "widget.tsx"),
        `export const Widget = () => null;\n`,
        "utf8",
      )
      const a = origin("@fixtures/package-a", packageDirA)
      const origins = new Map([[a.resolvedFile, a]])

      const { scannedSurfaces, scanFiles } = await computeScanSurface(
        fixtureRoot,
        [],
        origins,
        nodeBuildFs,
      )
      expect(scannedSurfaces).toEqual([
        { label: "application", root: "." },
        { label: "package:@fixtures/package-a", root: displayPath(fixtureRoot, packageDirA) },
      ])
      expect(scanFiles).toEqual(
        expect.arrayContaining([
          path.join(packageDirA, "consumer.ts"),
          path.join(packageDirA, "widget.tsx"),
        ]),
      )
    })

    it("scans each distinct package origin's own directory once each, keyed by resolvedFile -- not just the first", async () => {
      const a = origin("@fixtures/package-a", packageDirA)
      const b = origin("@fixtures/package-b", packageDirB)
      const origins = new Map([
        [a.resolvedFile, a],
        [b.resolvedFile, b],
      ])

      const { scannedSurfaces, scanFiles } = await computeScanSurface(
        fixtureRoot,
        [],
        origins,
        nodeBuildFs,
      )
      expect(scannedSurfaces).toEqual([
        { label: "application", root: "." },
        { label: "package:@fixtures/package-a", root: displayPath(fixtureRoot, packageDirA) },
        { label: "package:@fixtures/package-b", root: displayPath(fixtureRoot, packageDirB) },
      ])
      expect(scanFiles).toEqual(
        expect.arrayContaining([
          path.join(packageDirA, "consumer.ts"),
          path.join(packageDirB, "consumer.ts"),
        ]),
      )
    })

    it("scans a shared packageDir only once when two origins resolve into the same package", async () => {
      const a = origin("@fixtures/package-a", packageDirA)
      // A second, differently-named origin resolving to a DIFFERENT file
      // within the SAME packageDir -- multiple resolved schema files can
      // share one packageDir (a package with more than one allow-listed
      // export). Keyed by its own distinct resolvedFile, so both entries
      // survive in the Map, but the directory itself must only be scanned
      // (and surfaced) once.
      const bSameDir: PackageOrigin = {
        packageName: "@fixtures/package-a",
        declaredField: "envCap.schema",
        resolvedFile: path.join(packageDirA, "other.schema.ts"),
        packageDir: packageDirA,
      }
      const origins = new Map([
        [a.resolvedFile, a],
        [bSameDir.resolvedFile, bSameDir],
      ])

      const { scannedSurfaces, scanFiles } = await computeScanSurface(
        fixtureRoot,
        [],
        origins,
        nodeBuildFs,
      )
      expect(scannedSurfaces).toEqual([
        { label: "application", root: "." },
        { label: "package:@fixtures/package-a", root: displayPath(fixtureRoot, packageDirA) },
      ])
      expect(scanFiles.filter((f) => f === path.join(packageDirA, "consumer.ts"))).toHaveLength(1)
    })
  })
})

// Isolated from `fixtureRoot` above (own root, own beforeAll/afterAll) so this
// suite's tsconfig.json doesn't affect any other test's default auto-detection.
describe("generateUsageReport -- tsconfig path alias resolution (ADR 0023, Experimental)", () => {
  const aliasRoot = path.resolve(here, "fixtures-usage-generate-tsconfig-aliases")

  async function writeAliased(relativePath: string, content: string): Promise<string> {
    const filePath = path.join(aliasRoot, relativePath)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, "utf8")
    return filePath
  }

  beforeAll(async () => {
    await fs.rm(aliasRoot, { recursive: true, force: true })
    await writeAliased(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } }),
    )
    await writeAliased(
      "src/features/billing/env.schema.ts",
      `const billingSchema = { INVOICE_KEY: {} };
      export const billingEnv = createEnv(billingSchema, { name: "billing" });`,
    )
    await writeAliased(
      "src/consumer.ts",
      `import { billingEnv } from "@/features/billing/env.schema.js";\nbillingEnv.INVOICE_KEY;`,
    )
  })

  afterAll(async () => {
    await fs.rm(aliasRoot, { recursive: true, force: true })
  })

  it("a contract only ever consumed through a tsconfig path alias is not misreported as abandoned (default: auto-detected tsconfig.json)", async () => {
    const result = await generateUsageReport({ fs: nodeBuildFs, root: aliasRoot })

    expect(result.abandonedContracts).toEqual([])
    // Not just "not abandoned" -- INVOICE_KEY was actually member-accessed
    // (`billingEnv.INVOICE_KEY` above), so it must never show up as
    // unconsumed or indeterminate either.
    expect(result.unconsumedOwnedVariables).toEqual([])
    expect(result.indeterminate).toEqual([])
    const billing = result.dependencyOwnership.find((e) => e.contractName === "billing")
    expect(billing?.consumers).toEqual([
      path.relative(aliasRoot, path.join(aliasRoot, "src/consumer.ts")),
    ])
  })

  it("tsconfig: false reproduces the pre-ADR-0023 gap, for contrast -- the same contract misreported as abandoned", async () => {
    const result = await generateUsageReport({ fs: nodeBuildFs, root: aliasRoot, tsconfig: false })

    expect(result.abandonedContracts).toEqual([
      expect.objectContaining({ contractName: "billing" }),
    ])
  })
})
