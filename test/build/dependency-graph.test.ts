import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { nodeBuildFs } from "../support/build-filesystem.js"
import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs/promises"
import { generatedBanner } from "../../src/build/generated-banner.js"
import { linkFiles } from "../../src/build/link.js"
import type { DiscoveredContract } from "../../src/build/link.js"
import { buildDependencyGraph, deriveOwnershipFindings } from "../../src/build/dependency-graph.js"
import { dynamicAccessVariableIdentity } from "../../src/build/citation-verification.js"
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
  fs: nodeBuildFs,
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
    expect(contract.variables.get("STRIPE_KEY")?.evidence).toBe("member-access")
    // `warnings` is currently never populated by this function -- pinned so
    // any future accidental non-empty default is caught.
    expect(graph.warnings).toEqual([])
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
    expect(contract.variables.get("STRIPE_KEY")?.positions.map((p) => p.line)).toEqual([2])
    expect(contract.variables.get("STRIPE_KEY")?.positions.map((p) => p.file)).toEqual([
      consumerFile,
    ])
    expect(contract.variables.get("WEBHOOK_SECRET")?.positions.map((p) => p.line)).toEqual([3])
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
    expect(contract.variables.get("STRIPE_KEY")?.positions.map((p) => p.line)).toEqual([2, 3])
  })

  it("sorts a variable's access positions by file, not scan order -- a later-scanned file that sorts alphabetically first must still come first", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const zConsumer = await write(
      "z-consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nconsole.log(paymentsEnv.STRIPE_KEY);\n`,
    )
    const aConsumer = await write(
      "a-consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nconsole.log(paymentsEnv.STRIPE_KEY);\n`,
    )

    const contracts = await discover([schemaFile])
    // Deliberately scan the alphabetically-LAST file first.
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, zConsumer, aConsumer],
      readFile,
      context,
    )

    const contract = graph.contracts[0]
    expect(contract.variables.get("STRIPE_KEY")?.positions.map((p) => p.file)).toEqual([
      aConsumer,
      zConsumer,
    ])
  })

  it("sorts consumingFiles and dynamicAccessSites, not scan order -- multiple files, alphabetically-last scanned first", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const zConsumer = await write(
      "z-consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nconst k = "STRIPE_KEY";\nconsole.log(paymentsEnv[k]);\n`,
    )
    const aConsumer = await write(
      "a-consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nconst k = "STRIPE_KEY";\nconsole.log(paymentsEnv[k]);\n`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, zConsumer, aConsumer],
      readFile,
      context,
    )

    const contract = graph.contracts[0]
    expect(contract.consumingFiles).toEqual([aConsumer, zConsumer])
    expect(contract.dynamicAccessSites.map((s) => s.file)).toEqual([aConsumer, zConsumer])
  })

  it("sorts ambiguousBarrelFiles, not scan order -- multiple barrel-forwarding consumers, alphabetically-last scanned first", async () => {
    const unrelatedFile = await write(
      "unrelated/env.schema.ts",
      `export const unrelatedEnv = createEnv({ UNRELATED_KEY: {} }, { name: "unrelated" });`,
    )
    const barrelFile = await write("unrelated/index.ts", `export * from "./env.schema.js";`)
    const zConsumer = await write(
      "z-consumer.ts",
      `import { unrelatedEnv } from "./unrelated/index.js";\nunrelatedEnv.UNRELATED_KEY;\n`,
    )
    const aConsumer = await write(
      "a-consumer.ts",
      `import { unrelatedEnv } from "./unrelated/index.js";\nunrelatedEnv.UNRELATED_KEY;\n`,
    )

    const contracts = await discover([unrelatedFile])
    const graph = await buildDependencyGraph(
      contracts,
      [unrelatedFile, barrelFile, zConsumer, aConsumer],
      readFile,
      context,
    )

    const contract = graph.contracts[0]
    expect(contract.ambiguousBarrelFiles).toEqual([aConsumer, zConsumer])
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
    expect(contract.variables.get("STRIPE_KEY")?.evidence).toBe("dynamic-access")
    expect(contract.variables.get("STRIPE_KEY")?.positions).toEqual([])
    expect(contract.variables.get("WEBHOOK_SECRET")?.status).toBe("indeterminate")
    expect(contract.variables.get("WEBHOOK_SECRET")?.positions).toEqual([])
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
    // The dynamic-access site itself is retained, not just collapsed into
    // the boolean (ADR 0036) -- `paymentsEnv[key]` is on line 4.
    expect(contract.dynamicAccessSites).toEqual([{ file: consumerFile, line: 4, column: 1 }])

    const findings = deriveOwnershipFindings(graph)
    expect(findings.indeterminate).toEqual([
      expect.objectContaining({
        contractName: "payments",
        key: "WEBHOOK_SECRET",
        dynamicAccessSites: [{ file: consumerFile, line: 4, column: 1 }],
      }),
    ])
    expect(findings.indeterminate[0]?.reason).toContain(`${consumerFile}:4:`)
    expect(findings.indeterminate[0]?.reason).toContain("Searched: application")
    expect(findings.unconsumedOwned).toEqual([])
  })

  it("formats an indeterminate finding's reason with every scanned surface and dynamic-access site, comma-separated, verbatim", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ WEBHOOK_SECRET: {} }, { name: "payments" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nconst k1 = "WEBHOOK_SECRET";\npaymentsEnv[k1];\nconst k2 = "WEBHOOK_SECRET";\npaymentsEnv[k2];`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
      [
        { label: "application", root: "." },
        { label: "package:@acme/shared", root: "node_modules/@acme/shared" },
      ],
    )
    const findings = deriveOwnershipFindings(graph)

    expect(findings.indeterminate[0]?.reason).toBe(
      `Dynamic (computed) property access was observed on "paymentsEnv" -- cannot determine whether "WEBHOOK_SECRET" is read. Searched: application, package:@acme/shared. Dynamic access observed at: ${consumerFile}:3:1, ${consumerFile}:5:1.`,
    )
  })

  it("a variable with a fresh dynamicAccess assertion is reported asserted, never unconsumedOwned/indeterminate -- both for a status: unconsumed and a status: indeterminate variable, and status: used is unaffected", async () => {
    // Two contracts: "dynamic" has dynamic access observed on it (so its
    // otherwise-untouched variable would be indeterminate); "quiet" has none
    // at all (so its untouched variable would be unconsumed). Isolating them
    // avoids the existing "dynamic access anywhere on a contract widens every
    // other unconsumed variable on *that same contract* to indeterminate"
    // rule from collapsing both cases into one.
    const dynamicSchema = await write(
      "dynamic/env.schema.ts",
      `export const dynamicEnv = createEnv({ STRIPE_KEY: {}, WEBHOOK_SECRET: {} }, { name: "dynamic" });`,
    )
    const quietSchema = await write(
      "quiet/env.schema.ts",
      `export const quietEnv = createEnv({ CITED_KEY: {} }, { name: "quiet" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      [
        `import { dynamicEnv } from "./dynamic/env.schema.js";`,
        `import { quietEnv } from "./quiet/env.schema.js";`,
        `const key = "STRIPE_KEY";`,
        `dynamicEnv.STRIPE_KEY;`,
        `dynamicEnv[key];`,
        // `quietEnv` is imported but never referenced past the import
        // itself, on purpose -- a genuine "would be unconsumed" case. A
        // bare reference (`quietEnv;`) would itself now be an escape site
        // (ADR 0039) and turn this into a "would be indeterminate" case
        // instead, collapsing the very distinction this test exists to
        // prove alongside "dynamic"/WEBHOOK_SECRET below.
      ].join("\n"),
    )

    const contracts = await discover([dynamicSchema, quietSchema])
    const acknowledgments = new Map([
      [
        dynamicAccessVariableIdentity("dynamic/env.schema.ts", "dynamicEnv", "WEBHOOK_SECRET"),
        [
          {
            file: "scripts/webhook.sh",
            line: 1,
            column: 1,
            acknowledgment: "fresh" as const,
            contentHash: "deadbeef",
          },
        ],
      ],
      [
        dynamicAccessVariableIdentity("quiet/env.schema.ts", "quietEnv", "CITED_KEY"),
        [
          {
            file: "scripts/cited.sh",
            line: 2,
            column: 2,
            acknowledgment: "fresh" as const,
            contentHash: "deadbeef",
          },
        ],
      ],
      [
        dynamicAccessVariableIdentity("dynamic/env.schema.ts", "dynamicEnv", "STRIPE_KEY"),
        [
          {
            file: "scripts/unused.sh",
            line: 3,
            column: 3,
            acknowledgment: "fresh" as const,
            contentHash: "deadbeef",
          },
        ],
      ],
    ])
    const graph = await buildDependencyGraph(
      contracts,
      [dynamicSchema, quietSchema, consumerFile],
      readFile,
      context,
      undefined,
      acknowledgments,
    )

    const findings = deriveOwnershipFindings(graph)
    expect(findings.indeterminate).toEqual([])
    expect(findings.unconsumedOwned).toEqual([])
    expect(findings.asserted).toEqual([
      expect.objectContaining({
        contractName: "dynamic",
        key: "WEBHOOK_SECRET",
        wouldBeStatus: "indeterminate",
        dynamicAccessAssertions: [
          {
            file: "scripts/webhook.sh",
            line: 1,
            column: 1,
            acknowledgment: "fresh",
            contentHash: "deadbeef",
          },
        ],
      }),
      expect.objectContaining({
        contractName: "quiet",
        key: "CITED_KEY",
        wouldBeStatus: "unconsumed",
        dynamicAccessAssertions: [
          {
            file: "scripts/cited.sh",
            line: 2,
            column: 2,
            acknowledgment: "fresh",
            contentHash: "deadbeef",
          },
        ],
      }),
    ])
    // STRIPE_KEY is status "used" (real member access) -- a fresh assertion
    // on an already-proven variable is neither a problem nor an "asserted"
    // entry; it's simply irrelevant, matching Design 7's real intent (the
    // assertion only ever needs to explain away an *absence* of proof).
    expect(findings.asserted.some((f) => f.key === "STRIPE_KEY")).toBe(false)
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
    expect(graph.contracts[0].variables.get("STRIPE_KEY")?.evidence).toBe("no-access")
  })

  it("contract-level consumer vs. variable-level access are independent: a bare reference (passed as an argument) proves coupling but escapes per-variable analysis -- indeterminate, never a false unconsumed (ADR 0039)", async () => {
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
    // Variable-level: `paymentsEnv` was genuinely read (passed to
    // `initialize`), but this single-file scan can't attribute that read to
    // any specific key -- "indeterminate," never a false "unconsumed"
    // (which would claim certainty the scanner doesn't have). See ADR 0039.
    expect(contract.variables.get("STRIPE_KEY")?.status).toBe("indeterminate")
    expect(contract.variables.get("STRIPE_KEY")?.evidence).toBe("escape")
    expect(contract.escapeSites).toEqual([
      { file: consumerFile, line: 2, column: 12, via: "reference" },
    ])
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

  it("pass 2 never adds an ambiguousBarrelFiles entry for a contract already directly imported, even when its exportName matches the barrel-forwarded binding name", async () => {
    const paymentsFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    // Directly imported first -- `imported` is already true by the time
    // pass 2 examines this SAME binding name again through the barrel path
    // below.
    const directConsumer = await write(
      "direct-consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\npaymentsEnv.STRIPE_KEY;`,
    )
    const barrelFile = await write("other/index.ts", `export * from "./unresolved.js";`)
    const barrelConsumer = await write(
      "barrel-consumer.ts",
      `import { paymentsEnv } from "./other/index.js";\nconsole.log(paymentsEnv);`,
    )

    const contracts = await discover([paymentsFile])
    const graph = await buildDependencyGraph(
      contracts,
      [paymentsFile, directConsumer, barrelFile, barrelConsumer],
      readFile,
      context,
    )

    expect(graph.contracts[0].imported).toBe(true)
    expect(graph.contracts[0].ambiguousBarrelFiles).toEqual([])
    expect(deriveOwnershipFindings(graph).unresolvedConsumers).toEqual([])
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

  it("formats an unresolvedConsumers reason verbatim, with every ambiguous-barrel file comma-separated", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const barrelFile = await write("payments/index.ts", `export * from "./env.schema.js";`)
    const zConsumer = await write(
      "z-consumer.ts",
      `import { paymentsEnv } from "./payments/index.js";\npaymentsEnv.STRIPE_KEY;`,
    )
    const aConsumer = await write(
      "a-consumer.ts",
      `import { paymentsEnv } from "./payments/index.js";\npaymentsEnv.STRIPE_KEY;`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, barrelFile, zConsumer, aConsumer],
      readFile,
      context,
    )
    const findings = deriveOwnershipFindings(graph)

    expect(findings.unresolvedConsumers[0]?.reason).toBe(
      `Not directly imported anywhere, but 2 file(s) import "paymentsEnv" through a specifier that resolves to a file containing an unresolved "export * from" re-export -- cannot determine whether this contract is forwarded by it. Files: ${aConsumer}, ${zConsumer}.`,
    )
  })

  it("pass 2 never marks a contract ambiguous when the same-named binding resolves through a PLAIN file, not an unresolved wildcard re-export", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    // A plain, non-barrel file that happens to export a same-named binding
    // -- not a contract, and not reached through any wildcard re-export.
    const plainFile = await write(
      "plain.ts",
      `export const paymentsEnv = "not actually a contract";`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./plain.js";\nconsole.log(paymentsEnv);`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, plainFile, consumerFile],
      readFile,
      context,
    )
    const findings = deriveOwnershipFindings(graph)

    // The real "payments" contract was never actually imported through any
    // barrel -- must stay genuinely abandoned, not falsely rescued into
    // unresolvedConsumers by the same-named plain binding.
    expect(findings.abandoned).toEqual([expect.objectContaining({ contractName: "payments" })])
    expect(findings.unresolvedConsumers).toEqual([])
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
      `#!/usr/bin/env node\n${generatedBanner("ts")}\n\nimport { paymentsEnv } from "../payments/env.schema.js";\npaymentsEnv.STRIPE_KEY;\nexport const contracts = [paymentsEnv];\n`,
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
    const source = `#!/usr/bin/env node\n${generatedBanner("ts")}\n`
    const firstLine = source.split("\n")[0]
    // Demonstrates why B1 checks the first 20 non-empty lines, not just line one.
    expect(firstLine.includes("GENERATED FILE")).toBe(false)
    expect(source.includes("GENERATED FILE")).toBe(true)
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

  it("never throws when a member access names a property that isn't a declared variable key", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nconsole.log(paymentsEnv.NOT_A_DECLARED_KEY);`,
    )

    const contracts = await discover([schemaFile])
    const graph = await buildDependencyGraph(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
    )

    // The contract is still coupled (imported+referenced), but the one
    // declared variable was never actually accessed.
    expect(graph.contracts[0].imported).toBe(true)
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
    // No bare reference to `paymentsEnv` past the import, on purpose --
    // that alone would now be an escape site (ADR 0039) and produce
    // "indeterminate," muddying this test's actual point: the string
    // literal's contents must never be parsed for identifiers at all.
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nconsole.log("paymentsEnv.STRIPE_KEY");`,
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

  it("defaults scannedSurfaces to a single application entry when the caller passes none, and threads through a caller-provided list unchanged", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const contracts = await discover([schemaFile])

    const defaulted = await buildDependencyGraph(contracts, [schemaFile], readFile, context)
    expect(defaulted.scannedSurfaces).toEqual([{ label: "application", root: "." }])

    const custom = await buildDependencyGraph(contracts, [schemaFile], readFile, context, [
      { label: "application", root: "." },
      { label: "package:@acme/shared", root: "node_modules/@acme/shared" },
    ])
    expect(custom.scannedSurfaces).toEqual([
      { label: "application", root: "." },
      { label: "package:@acme/shared", root: "node_modules/@acme/shared" },
    ])
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
        fs: nodeBuildFs,
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

      const { resolution, warning } = await loadTsconfigPaths(fixtureRoot, undefined, nodeBuildFs)
      expect(warning).toBeUndefined()
      const aliasContext: ImportResolutionContext = {
        fs: nodeBuildFs,
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

  describe("local dataflow escapes (ADR 0039): destructuring/aliasing shapes this scan can't fully follow widen to indeterminate, never a false unconsumed", () => {
    it("a destructured key is proven used; a bare reference to the same contract elsewhere widens every OTHER not-otherwise-accessed variable to indeterminate -- a proven member access always wins over an escape on the same key", async () => {
      const schemaFile = await write(
        "payments/env.schema.ts",
        `export const paymentsEnv = createEnv({ STRIPE_KEY: {}, WEBHOOK_SECRET: {} }, { name: "payments" });`,
      )
      const consumerFile = await write(
        "consumer.ts",
        `import { paymentsEnv } from "./payments/env.schema.js";\nconst { STRIPE_KEY } = paymentsEnv;\nuse(paymentsEnv);`,
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
      expect(contract.variables.get("WEBHOOK_SECRET")?.status).toBe("indeterminate")
      expect(contract.variables.get("WEBHOOK_SECRET")?.evidence).toBe("escape")
      // An escape-indeterminate variable carries no access positions -- nothing was ever member-accessed.
      expect(contract.variables.get("WEBHOOK_SECRET")?.positions).toEqual([])
      expect(contract.escapeSites).toEqual([
        { file: consumerFile, line: 3, column: 5, via: "reference" },
      ])

      const findings = deriveOwnershipFindings(graph)
      expect(findings.unconsumedOwned).toEqual([])
      expect(findings.indeterminate).toEqual([
        expect.objectContaining({ contractName: "payments", key: "WEBHOOK_SECRET" }),
      ])
      expect(findings.indeterminate[0]?.reason).toBe(
        `Contract "paymentsEnv" is used in a way this scanner's local dataflow analysis cannot ` +
          `follow (a rest binding, nested destructuring, a computed key, an ambiguous alias, or the ` +
          `contract passed/referenced directly) -- cannot determine whether "WEBHOOK_SECRET" is read. ` +
          `Searched: application. Escaped at: ${consumerFile}:3:5 (reference).`,
      )
    })

    it("a rest-binding element on an otherwise fully-destructured contract widens the not-otherwise-accessed keys to indeterminate", async () => {
      const schemaFile = await write(
        "payments/env.schema.ts",
        `export const paymentsEnv = createEnv({ STRIPE_KEY: {}, WEBHOOK_SECRET: {} }, { name: "payments" });`,
      )
      const consumerFile = await write(
        "consumer.ts",
        `import { paymentsEnv } from "./payments/env.schema.js";\nconst { STRIPE_KEY, ...rest } = paymentsEnv;`,
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
      expect(contract.variables.get("WEBHOOK_SECRET")?.status).toBe("indeterminate")
      // The escape site's `via` is threaded through from the scanner verbatim
      // -- a rest binding, not the generic "reference".
      expect(contract.escapeSites).toEqual([
        { file: consumerFile, line: 2, column: 21, via: "rest" },
      ])
      expect(deriveOwnershipFindings(graph).unconsumedOwned).toEqual([])
    })

    it("threads a nested-pattern and a computed-key escape's `via` through to the contract verbatim, distinct from a plain reference", async () => {
      const schemaFile = await write(
        "payments/env.schema.ts",
        `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
      )
      const nestedConsumer = await write(
        "nested.ts",
        `import { paymentsEnv } from "./payments/env.schema.js";\nconst { DB: { HOST } } = paymentsEnv;`,
      )
      const computedConsumer = await write(
        "computed.ts",
        `import { paymentsEnv } from "./payments/env.schema.js";\nconst k = pick();\nconst { [k]: v } = paymentsEnv;`,
      )

      const contracts = await discover([schemaFile])
      const graph = await buildDependencyGraph(
        contracts,
        [schemaFile, nestedConsumer, computedConsumer],
        readFile,
        context,
      )

      expect(graph.contracts[0].escapeSites).toEqual([
        { file: computedConsumer, line: 3, column: 9, via: "computed-key" },
        { file: nestedConsumer, line: 2, column: 9, via: "nested-pattern" },
      ])
      expect(graph.contracts[0].variables.get("STRIPE_KEY")?.status).toBe("indeterminate")
    })

    it("a one-level const alias's member access is attributed back to the original contract, exactly like the alias resolution (import rename) case above", async () => {
      const schemaFile = await write(
        "payments/env.schema.ts",
        `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
      )
      const consumerFile = await write(
        "consumer.ts",
        `import { paymentsEnv } from "./payments/env.schema.js";\nconst local = paymentsEnv;\nlocal.STRIPE_KEY;`,
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
      expect(contract.variables.get("STRIPE_KEY")?.evidence).toBe("member-access")
    })

    it("a chained alias (`const b = a`) widens the not-otherwise-accessed keys of the contract to indeterminate -- the second hop is never followed", async () => {
      const schemaFile = await write(
        "payments/env.schema.ts",
        `export const paymentsEnv = createEnv({ STRIPE_KEY: {}, WEBHOOK_SECRET: {} }, { name: "payments" });`,
      )
      const consumerFile = await write(
        "consumer.ts",
        `import { paymentsEnv } from "./payments/env.schema.js";\nconst a = paymentsEnv;\nconst b = a;\na.STRIPE_KEY;`,
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
      expect(contract.variables.get("WEBHOOK_SECRET")?.status).toBe("indeterminate")
      expect(contract.escapeSites).toEqual([
        { file: consumerFile, line: 3, column: 11, via: "reference" },
      ])
    })

    it("sorts a contract's escapeSites by file, not scan order -- a later-scanned file that sorts alphabetically first still comes first", async () => {
      const schemaFile = await write(
        "payments/env.schema.ts",
        `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
      )
      const zConsumer = await write(
        "z-consumer.ts",
        `import { paymentsEnv } from "./payments/env.schema.js";\nuse(paymentsEnv);`,
      )
      // Two escape sites in ONE file, on different lines -- exercises the
      // same-file line tiebreak in the sort comparator too.
      const aConsumer = await write(
        "a-consumer.ts",
        `import { paymentsEnv } from "./payments/env.schema.js";\nuse(paymentsEnv);\nagain(paymentsEnv);`,
      )

      const contracts = await discover([schemaFile])
      // Deliberately scan the alphabetically-LAST file first.
      const graph = await buildDependencyGraph(
        contracts,
        [schemaFile, zConsumer, aConsumer],
        readFile,
        context,
      )

      const contract = graph.contracts[0]
      expect(contract.escapeSites).toEqual([
        { file: aConsumer, line: 2, column: 5, via: "reference" },
        { file: aConsumer, line: 3, column: 7, via: "reference" },
        { file: zConsumer, line: 2, column: 5, via: "reference" },
      ])
      expect(contract.variables.get("STRIPE_KEY")?.status).toBe("indeterminate")
      const findings = deriveOwnershipFindings(graph)
      expect(findings.indeterminate[0]?.escapeSites.map((s) => s.file)).toEqual([
        aConsumer,
        aConsumer,
        zConsumer,
      ])
      expect(findings.indeterminate[0]?.reason).toContain(
        `Escaped at: ${aConsumer}:2:5 (reference), ${aConsumer}:3:7 (reference), ${zConsumer}:2:5 (reference).`,
      )
    })

    it("a let-declared local is never tracked as an alias -- its own bare read of the import still proves coupling and escapes to indeterminate, and the local's own later property access is invisible to the scan", async () => {
      const schemaFile = await write(
        "payments/env.schema.ts",
        `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
      )
      const consumerFile = await write(
        "consumer.ts",
        `import { paymentsEnv } from "./payments/env.schema.js";\nlet local = paymentsEnv;\nlocal = other;\nlocal.STRIPE_KEY;`,
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
      expect(contract.variables.get("STRIPE_KEY")?.status).toBe("indeterminate")
      expect(contract.variables.get("STRIPE_KEY")?.evidence).toBe("escape")
    })
  })
})
