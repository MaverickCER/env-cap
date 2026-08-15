import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs/promises"
import { linkFiles } from "../../src/build/link.js"
import type { DiscoveredContract } from "../../src/build/link.js"
import { buildDependencyGraph, deriveOwnershipFindings } from "../../src/build/dependency-graph.js"
import type { ImportResolutionContext } from "../../src/build/resolution/resolve-import.js"
import type { PackageSchemaResolutionResult } from "../../src/build/resolution/resolve-package-schema.js"
import {
  createAliasResolutionCache,
  loadTsconfigPaths,
} from "../../src/build/resolution/resolve-tsconfig-paths.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(here, "fixtures-dependency-graph")

async function write(relativePath: string, content: string): Promise<string> {
  const filePath = path.join(fixtureRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf8")
  return filePath
}

const readFile = (filePath: string) => fs.readFile(filePath, "utf8")

// No test in this file (outside the ADR 0014/0023-specific describe blocks
// below) exercises cross-package discovery or tsconfig alias resolution --
// `packages: []`/`tsconfigPaths: undefined` means resolveImportSpecifier's
// package/alias fallbacks are never invoked, so one shared, never-populated
// context is safe to reuse everywhere else.
const context: ImportResolutionContext = {
  root: fixtureRoot,
  packages: [],
  cache: new Map<string, Promise<PackageSchemaResolutionResult>>(),
  tsconfigPaths: undefined,
  aliasCache: createAliasResolutionCache(),
}

async function discover(schemaFiles: string[]): Promise<readonly DiscoveredContract[]> {
  const result = await linkFiles(schemaFiles, readFile, context)
  return result.contracts
}

beforeEach(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
})
afterEach(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
})

describe("buildDependencyGraph / deriveOwnershipFindings", () => {
  it("alias resolution attributes usage back to the original export", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv as env } from "./payments/env.schema.js";\nconsole.log(env.STRIPE_KEY);`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
    )

    const contract = graph.contracts[0]
    expect(contract.imported).toBe(true)
    expect(contract.consumingFiles).toEqual([consumerFile])
    expect(contract.variables.get("STRIPE_KEY")?.status).toBe("used")
  })

  it("dot-notation and string-literal element access both count as member access", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {}, WEBHOOK_SECRET: {} }, { name: "payments" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\npaymentsEnv.STRIPE_KEY;\npaymentsEnv["WEBHOOK_SECRET"];`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
    )

    const contract = graph.contracts[0]
    expect(contract.variables.get("STRIPE_KEY")?.status).toBe("used")
    expect(contract.variables.get("WEBHOOK_SECRET")?.status).toBe("used")
    expect(contract.hasDynamicAccess).toBe(false)
    // Line 1 is the import; the two accesses are on lines 2 and 3 respectively.
    expect(contract.variables.get("STRIPE_KEY")?.lines).toEqual([2])
    expect(contract.variables.get("WEBHOOK_SECRET")?.lines).toEqual([3])
  })

  it("records every line a variable is member-accessed on, not just the first", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nconsole.log(paymentsEnv.STRIPE_KEY);\nif (paymentsEnv.STRIPE_KEY) {}\n`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
    )

    const contract = graph.contracts[0]
    expect(contract.variables.get("STRIPE_KEY")?.lines).toEqual([2, 3])
  })

  it("leaves lines empty for an unconsumed or indeterminate variable", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {}, WEBHOOK_SECRET: {} }, { name: "payments" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nconst key = "STRIPE_KEY";\npaymentsEnv[key];`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
    )

    const contract = graph.contracts[0]
    expect(contract.variables.get("STRIPE_KEY")?.status).toBe("indeterminate")
    expect(contract.variables.get("STRIPE_KEY")?.lines).toEqual([])
    expect(contract.variables.get("WEBHOOK_SECRET")?.status).toBe("indeterminate")
    expect(contract.variables.get("WEBHOOK_SECRET")?.lines).toEqual([])
  })

  it("computed element access produces dynamic access and forces not-otherwise-accessed variables to indeterminate, never unconsumed", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {}, WEBHOOK_SECRET: {} }, { name: "payments" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nconst key = "STRIPE_KEY";\npaymentsEnv.STRIPE_KEY;\npaymentsEnv[key];`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
    )

    const contract = graph.contracts[0]
    expect(contract.hasDynamicAccess).toBe(true)
    // STRIPE_KEY was also directly member-accessed, so it stays proven "used".
    expect(contract.variables.get("STRIPE_KEY")?.status).toBe("used")
    // WEBHOOK_SECRET has no member access anywhere, but dynamic access exists
    // on this contract -- must be "indeterminate", never "unconsumed".
    expect(contract.variables.get("WEBHOOK_SECRET")?.status).toBe("indeterminate")

    const findings = deriveOwnershipFindings(graph)
    expect(findings.indeterminate).toEqual([
      expect.objectContaining({ contractName: "payments", key: "WEBHOOK_SECRET" }),
    ])
    expect(findings.unconsumedOwned).toEqual([])
  })

  it("an imported-but-never-referenced-past-the-import contract has every variable unconsumed", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    // Imported but the binding is never used anywhere in the file body.
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\n`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
    )

    expect(graph.contracts[0].variables.get("STRIPE_KEY")?.status).toBe("unconsumed")
  })

  it("contract-level consumer vs. variable-level access are independent: referenced without any property read still proves coupling", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\ninitialize(paymentsEnv);`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
    )

    const contract = graph.contracts[0]
    // Contract-level: this file is a proven consumer (coupling exists).
    expect(contract.imported).toBe(true)
    expect(contract.consumingFiles).toEqual([consumerFile])
    // Variable-level: independently, nothing was ever read -- unconsumed, not a contradiction.
    expect(contract.variables.get("STRIPE_KEY")?.status).toBe("unconsumed")
  })

  it("a contract never imported anywhere, with no ambiguous barrel path, is abandoned", async () => {
    const schemaFile = await write(
      "orphaned/env.schema.ts",
      `export const orphanedEnv = createEnv({ OLD_KEY: {} }, { name: "orphaned" });`,
    )
    const unrelatedFile = await write("unrelated.ts", `console.log("nothing to see here");`)

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, unrelatedFile],
      readFile,
      context,
    )
    const findings = deriveOwnershipFindings(graph)

    expect(findings.abandoned).toEqual([
      expect.objectContaining({ contractName: "orphaned", file: schemaFile }),
    ])
  })

  it("skips a scanned file that fails to read, without throwing", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const missingFile = path.join(fixtureRoot, "does-not-exist.ts")

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, missingFile],
      readFile,
      context,
    )

    expect(graph.contracts[0]?.imported).toBe(false)
  })

  it("pass 2 (ambiguous barrel forwarding) skips a contract that's already directly imported, and skips a contract whose name doesn't match the binding", async () => {
    const paymentsFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    // Directly imported elsewhere -- `imported` is already true by the time
    // pass 2 runs, so it must be skipped rather than gaining an
    // ambiguousBarrelFiles entry.
    const otherFile = await write(
      "other/env.schema.ts",
      `export const otherEnv = createEnv({ OTHER_KEY: {} }, { name: "other" });`,
    )
    const otherConsumer = await write(
      "other-consumer.ts",
      `import { otherEnv } from "./other/env.schema.js";\notherEnv.OTHER_KEY;`,
    )
    // Never imported anywhere, and its exportName doesn't match the
    // barrel-forwarded name below -- must be skipped on the name check.
    const unrelatedFile = await write(
      "unrelated/env.schema.ts",
      `export const unrelatedEnv = createEnv({ UNRELATED_KEY: {} }, { name: "unrelated" });`,
    )
    const barrelFile = await write("payments/index.ts", `export * from "./env.schema.js";`)
    const barrelConsumer = await write(
      "barrel-consumer.ts",
      `import { paymentsEnv } from "./payments/index.js";\npaymentsEnv.STRIPE_KEY;`,
    )

    const contracts = await discover([paymentsFile, otherFile, unrelatedFile])
    const graph = await buildDependencyGraph(
      contracts,
      [paymentsFile, otherFile, unrelatedFile, otherConsumer, barrelFile, barrelConsumer],
      readFile,
      context,
    )
    const findings = deriveOwnershipFindings(graph)

    expect(findings.unresolvedConsumers).toEqual([
      expect.objectContaining({ contractName: "payments" }),
    ])
    // "other" was already imported directly -- not abandoned, not ambiguous.
    expect(graph.contracts.find((c) => c.contractName === "other")?.ambiguousBarrelFiles).toEqual(
      [],
    )
    // "unrelated" was never imported and its name doesn't match the barrel
    // forward -- genuinely abandoned, not ambiguous.
    expect(findings.abandoned).toEqual([expect.objectContaining({ contractName: "unrelated" })])
  })

  it("a contract reachable only through an unresolved barrel re-export lands in unresolvedConsumers, never abandoned", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const barrelFile = await write("payments/index.ts", `export * from "./env.schema.js";`)
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/index.js";\npaymentsEnv.STRIPE_KEY;`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, barrelFile, consumerFile],
      readFile,
      context,
    )
    const findings = deriveOwnershipFindings(graph)

    expect(findings.abandoned).toEqual([])
    expect(findings.unresolvedConsumers).toHaveLength(1)
    expect(findings.unresolvedConsumers[0]?.contractName).toBe("payments")
    expect(findings.unresolvedConsumers[0]?.reason).toContain("export * from")
  })

  it("unresolvable import specifiers (bare package, nonexistent file) are silently skipped, never guessed at", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { something } from "some-package";\nimport { other } from "./does-not-exist.js";\nconsole.log(something, other);`,
    )

    const contracts = await discover([schemaFile])
    await expect(
      buildDependencyGraph(contracts, [schemaFile, consumerFile], readFile, context),
    ).resolves.toBeDefined()

    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
    )
    const findings = deriveOwnershipFindings(graph)
    expect(findings.abandoned).toEqual([expect.objectContaining({ contractName: "payments" })])
  })

  it("excludes a generated-banner file from the scan even with a shebang line before the banner comment", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    // Mimics the self-reference loop: the generated manifest re-imports and
    // re-exports every active contract, which must never count as "used".
    const generatedFile = await write(
      "generated/env.manifest.ts",
      `#!/usr/bin/env node\n// AUTO-GENERATED FILE.\n// DO NOT EDIT.\n\nimport { paymentsEnv } from "../payments/env.schema.js";\npaymentsEnv.STRIPE_KEY;\nexport const contracts = [paymentsEnv];\n`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, generatedFile],
      readFile,
      context,
    )
    const findings = deriveOwnershipFindings(graph)

    // The generated file is excluded from the scan entirely -- the contract
    // it re-exports must still show up as abandoned, not falsely "used".
    expect(findings.abandoned).toEqual([expect.objectContaining({ contractName: "payments" })])
  })

  it("regression: a first-line-only banner check would have wrongly included the shebang fixture above", async () => {
    const source = `#!/usr/bin/env node\n// AUTO-GENERATED FILE.\n// DO NOT EDIT.\n`
    const firstLine = source.split("\n")[0]
    // Demonstrates why B1 checks the first 20 non-empty lines, not just line one.
    expect(firstLine.includes("AUTO-GENERATED FILE")).toBe(false)
    expect(source.includes("AUTO-GENERATED FILE")).toBe(true)
  })

  it("never registers access from an unrelated import, even with a similarly-named property", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const unrelatedModule = await write(
      "other.ts",
      `export const other = { STRIPE_KEY: "unrelated" };`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nimport { other } from "./other.js";\nconsole.log(other.STRIPE_KEY);`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, unrelatedModule, consumerFile],
      readFile,
      context,
    )

    // `other.STRIPE_KEY` must never register as access to `paymentsEnv`.
    expect(graph.contracts[0].variables.get("STRIPE_KEY")?.status).toBe("unconsumed")
  })

  it("never fuzzy-matches a similarly-named file", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    // A decoy file with a similar name that is NOT the real schema file.
    await write(
      "payments/env.schema.backup.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments-backup" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.backup.js";\npaymentsEnv.STRIPE_KEY;`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
    )

    // The consumer imports the *backup* file, an exact-path match against a
    // different (undiscovered) contract -- the real contract must not be
    // credited with this usage.
    expect(graph.contracts[0].imported).toBe(false)
  })

  it("never registers access from a comment", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\n// paymentsEnv.STRIPE_KEY\n`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
    )

    const contract = graph.contracts[0]
    expect(contract.imported).toBe(true) // the import itself still counts as coupling
    expect(contract.variables.get("STRIPE_KEY")?.status).toBe("unconsumed")
  })

  it("never registers access from a string literal", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nconsole.log("paymentsEnv.STRIPE_KEY");\ninitialize(paymentsEnv);`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
    )

    expect(graph.contracts[0].variables.get("STRIPE_KEY")?.status).toBe("unconsumed")
  })

  it("multi-file, multi-contract graphs aggregate correctly", async () => {
    const paymentsSchema = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const databaseSchema = await write(
      "database/env.schema.ts",
      `export const databaseEnv = createEnv({ DATABASE_URL: {} }, { name: "database" });`,
    )
    const consumerA = await write(
      "server.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nimport { databaseEnv } from "./database/env.schema.js";\npaymentsEnv.STRIPE_KEY;\ndatabaseEnv.DATABASE_URL;`,
    )
    const consumerB = await write(
      "worker.ts",
      `import { databaseEnv } from "./database/env.schema.js";\ndatabaseEnv.DATABASE_URL;`,
    )

    const contracts = await discover([paymentsSchema, databaseSchema])
    const graph = await buildDependencyGraph(
      contracts,
      [paymentsSchema, databaseSchema, consumerA, consumerB],
      readFile,
      context,
    )

    const payments = graph.contracts.find((c) => c.contractName === "payments")!
    const database = graph.contracts.find((c) => c.contractName === "database")!

    expect(payments.consumingFiles).toEqual([consumerA])
    expect(payments.variables.get("STRIPE_KEY")?.status).toBe("used")

    expect([...database.consumingFiles].sort()).toEqual([consumerA, consumerB].sort())
    expect(database.variables.get("DATABASE_URL")?.status).toBe("used")
  })

  describe("cross-package contracts (ADR 0014, Experimental)", () => {
    it("a contract resolved via an allow-listed package, bare-imported by a local consumer, is marked imported -- never abandoned", async () => {
      // Real package.json + require.resolve()-reachable layout, the same
      // shape resolvePackageSchemaFile() expects -- see resolve-package-schema.test.ts
      // for the resolver's own unit tests; this proves the load-bearing
      // wiring into buildDependencyGraph specifically: without it, this
      // contract would show up as abandoned, since Pass 1 could never
      // resolve the bare `import ... from "@fixtures/pkg-a"` specifier.
      await write(
        "node_modules/@fixtures/pkg-a/package.json",
        JSON.stringify({
          name: "@fixtures/pkg-a",
          main: "./index.js",
          envCap: { schema: "./src/env.schema.ts" },
        }),
      )
      await write("node_modules/@fixtures/pkg-a/index.js", "module.exports = {};")
      const packageSchemaFile = await write(
        "node_modules/@fixtures/pkg-a/src/env.schema.ts",
        `export const pkgAEnv = createEnv({ API_KEY: {} }, { name: "pkg-a" });`,
      )
      const consumerFile = await write(
        "consumer-of-package.ts",
        `import { pkgAEnv } from "@fixtures/pkg-a";\npkgAEnv.API_KEY;`,
      )

      const packageContext: ImportResolutionContext = {
        root: fixtureRoot,
        packages: ["@fixtures/pkg-a"],
        cache: new Map(),
        tsconfigPaths: undefined,
        aliasCache: createAliasResolutionCache(),
      }
      const linkResult = await linkFiles([packageSchemaFile], readFile, packageContext)
      expect(linkResult.contracts).toHaveLength(1)

      const graph = await buildDependencyGraph(
        linkResult.contracts,
        [packageSchemaFile, consumerFile],
        readFile,
        packageContext,
      )
      const findings = deriveOwnershipFindings(graph)

      const contract = graph.contracts[0]
      expect(contract.imported).toBe(true)
      expect(contract.consumingFiles).toEqual([consumerFile])
      expect(contract.variables.get("API_KEY")?.status).toBe("used")
      expect(findings.abandoned).toEqual([])
    })
  })

  describe("tsconfig path alias resolution (ADR 0023, Experimental)", () => {
    it("a contract declared under an aliased path, imported by a local consumer via the alias, is marked imported -- never abandoned", async () => {
      await write(
        "tsconfig.json",
        JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: { "@/*": ["src/*"] },
            module: "ESNext",
            moduleResolution: "Bundler",
          },
        }),
      )
      const schemaFile = await write(
        "src/env.schema.ts",
        `export const aliasEnv = createEnv({ ALIAS_KEY: {} }, { name: "alias" });`,
      )
      const consumerFile = await write(
        "consumer-of-alias.ts",
        `import { aliasEnv } from "@/env.schema.js";\naliasEnv.ALIAS_KEY;`,
      )

      const { resolution, warning } = await loadTsconfigPaths(fixtureRoot, undefined)
      expect(warning).toBeUndefined()
      const aliasContext: ImportResolutionContext = {
        root: fixtureRoot,
        packages: [],
        cache: new Map(),
        tsconfigPaths: resolution!,
        aliasCache: createAliasResolutionCache(),
      }

      const linkResult = await linkFiles([schemaFile], readFile, aliasContext)
      expect(linkResult.contracts).toHaveLength(1)

      const graph = await buildDependencyGraph(
        linkResult.contracts,
        [schemaFile, consumerFile],
        readFile,
        aliasContext,
      )
      const findings = deriveOwnershipFindings(graph)

      const contract = graph.contracts[0]
      expect(contract.imported).toBe(true)
      expect(contract.consumingFiles).toEqual([consumerFile])
      expect(contract.variables.get("ALIAS_KEY")?.status).toBe("used")
      expect(findings.abandoned).toEqual([])
      // Not just "not abandoned" -- ALIAS_KEY was actually member-accessed
      // (`aliasEnv.ALIAS_KEY` above), so it must never show up as
      // unconsumed or indeterminate either. Both come from the same
      // per-variable status computed off the same alias-resolved import, so
      // this is a real, independent check, not a restatement of the above.
      expect(findings.unconsumedOwned).toEqual([])
      expect(findings.indeterminate).toEqual([])
    })
  })
})
