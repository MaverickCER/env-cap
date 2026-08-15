import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { discoverSchemaFiles } from "../../src/build/discover.js"
import { EnvUsageAnalysisError } from "../../src/build/errors.js"
import { computeUsage, generateUsageReport } from "../../src/build/generate-usage.js"
import { linkFiles } from "../../src/build/link.js"
import type { ImportResolutionContext } from "../../src/build/resolution/resolve-import.js"
import type { PackageSchemaResolutionResult } from "../../src/build/resolution/resolve-package-schema.js"
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
  })

  afterAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true })
  })

  it("maps the dependency graph into the ownership-framed public result, with owner/consumers, and no blastRadius field", async () => {
    const result = await generateUsageReport({ root: fixtureRoot })

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

  it("onOwnershipIssue: warn (default) never throws", async () => {
    await expect(generateUsageReport({ root: fixtureRoot })).resolves.toBeDefined()
  })

  it("onOwnershipIssue: throw escalates abandoned/unconsumed findings but not unresolved/indeterminate", async () => {
    await expect(
      generateUsageReport({ root: fixtureRoot, onOwnershipIssue: "throw" }),
    ).rejects.toThrow(EnvUsageAnalysisError)
  })

  it("writes the Dependency & Ownership Report to disk when report.location is given", async () => {
    const result = await generateUsageReport({
      root: fixtureRoot,
      report: { location: "docs/OWNERSHIP.md" },
    })
    expect(result.reportPath).toBe(path.resolve(fixtureRoot, "docs/OWNERSHIP.md"))
    const source = await fs.readFile(result.reportPath!, "utf8")
    expect(source).toContain("<!-- AUTO-GENERATED FILE. DO NOT EDIT. -->")
    expect(source).toContain("Dependency & Ownership Report")
    expect(source).toContain("payments-team")
  })

  it("does not write anything when report.location is omitted", async () => {
    const result = await generateUsageReport({ root: fixtureRoot })
    expect(result.reportPath).toBeUndefined()
  })

  it("compute/render/write are independently usable: computeUsage never touches the filesystem for writing", async () => {
    const context: ImportResolutionContext = {
      root: fixtureRoot,
      packages: [],
      cache: new Map<string, Promise<PackageSchemaResolutionResult>>(),
      tsconfigPaths: undefined,
      aliasCache: createAliasResolutionCache(),
    }
    const schemaFiles = await discoverSchemaFiles({
      root: fixtureRoot,
      include: ["**/env.schema.ts"],
      exclude: [],
    })
    const linkResult = await linkFiles(schemaFiles, (f) => fs.readFile(f, "utf8"), context)
    const scanFiles = await discoverSchemaFiles({
      root: fixtureRoot,
      include: ["**/*.ts"],
      exclude: [],
    })

    const computed = await computeUsage(
      fixtureRoot,
      linkResult.contracts,
      scanFiles,
      (f) => fs.readFile(f, "utf8"),
      "warn",
      context,
      linkResult.warnings,
    )
    expect(computed.result.dependencyOwnership.length).toBeGreaterThan(0)

    const notWrittenPath = path.resolve(fixtureRoot, "docs/should-not-exist.md")
    await expect(fs.access(notWrittenPath)).rejects.toThrow()
  })

  describe("output path safety", () => {
    it("rejects a relative report.location that escapes root via `..`", async () => {
      const outside = path.resolve(fixtureRoot, "..", "escaped-ownership.md")
      await fs.rm(outside, { force: true })

      await expect(
        generateUsageReport({ root: fixtureRoot, report: { location: "../escaped-ownership.md" } }),
      ).rejects.toThrow(EnvUsageAnalysisError)

      await expect(fs.access(outside)).rejects.toThrow()
    })

    it("rejects an absolute report.location outside root", async () => {
      const outside = path.join(os.tmpdir(), `env-cap-ownership-escape-test-${Date.now()}.md`)
      await fs.rm(outside, { force: true })

      await expect(
        generateUsageReport({ root: fixtureRoot, report: { location: outside } }),
      ).rejects.toThrow(EnvUsageAnalysisError)

      await expect(fs.access(outside)).rejects.toThrow()
    })
  })

  it("is standalone self-sufficient: does its own discovery, no generateEnvArtifacts involved", async () => {
    const isolatedRoot = path.resolve(fixtureRoot, "features/payments")
    const result = await generateUsageReport({ root: isolatedRoot })
    expect(result.dependencyOwnership.some((e) => e.contractName === "payments")).toBe(true)
  })

  it("defaults root to process.cwd() when omitted", async () => {
    const originalCwd = process.cwd()
    process.chdir(path.resolve(fixtureRoot, "features/payments"))
    try {
      const result = await generateUsageReport({})
      expect(result.dependencyOwnership.some((e) => e.contractName === "payments")).toBe(true)
    } finally {
      process.chdir(originalCwd)
    }
  })

  it("resolves an unconsumed variable's effective owner -- its own override, not just the contract's (regression, ADR 0028)", async () => {
    const ownerFallbackRoot = path.resolve(fixtureRoot, "owner-fallback")
    await write(
      "owner-fallback/features/billing/env.schema.ts",
      `const billingSchema = { INVOICE_KEY: {} };
      export const billingEnv = createEnv(billingSchema, { name: "billing" });
      documentEnv(billingSchema, { variables: { INVOICE_KEY: { owner: "billing-team" } } });`,
    )
    // Imports the contract (so it's not "abandoned") but never accesses
    // INVOICE_KEY (so the variable itself is "unconsumed"). The contract
    // declares no owner of its own -- only the variable does.
    await write(
      "owner-fallback/src/server.ts",
      `import { billingEnv } from "../features/billing/env.schema.js";\nconsole.log(billingEnv);\n`,
    )

    const result = await generateUsageReport({ root: ownerFallbackRoot })
    expect(result.unconsumedOwnedVariables).toEqual([
      expect.objectContaining({
        contractName: "billing",
        key: "INVOICE_KEY",
        owner: "billing-team",
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

    const result = await generateUsageReport({ root: ambiguousRoot })

    expect(result.unresolvedConsumers).toEqual([
      expect.objectContaining({ contractName: "billing" }),
    ])
    expect(result.indeterminate).toEqual([
      expect.objectContaining({ contractName: "payroll", key: "BONUS_KEY" }),
    ])
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
    const result = await generateUsageReport({ root: aliasRoot })

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
    const result = await generateUsageReport({ root: aliasRoot, tsconfig: false })

    expect(result.abandonedContracts).toEqual([
      expect.objectContaining({ contractName: "billing" }),
    ])
  })
})
