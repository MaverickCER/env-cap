import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { nodeBuildFs } from "../support/build-filesystem.js"
import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs/promises"
import { linkFiles } from "../../src/build/link.js"
import type { DiscoveredContract } from "../../src/build/link.js"
import {
  buildDependencyModel,
  DEPENDENCY_MODEL_SCHEMA_VERSION,
} from "../../src/build/dependency-model.js"
import type { ImportResolutionContext } from "../../src/build/resolution/resolve-import.js"
import type { PackageSchemaResolutionResult } from "../../src/build/resolution/resolve-package-schema.js"
import { createAliasResolutionCache } from "../../src/build/resolution/resolve-tsconfig-paths.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(here, "fixtures-dependency-model")

async function write(relativePath: string, content: string): Promise<string> {
  const filePath = path.join(fixtureRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf8")
  return filePath
}

const readFile = (filePath: string) => fs.readFile(filePath, "utf8")

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

describe("buildDependencyModel", () => {
  it("carries the current schema version and root-relative, POSIX-separated file paths", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\npaymentsEnv.STRIPE_KEY;\n`,
    )

    const contracts = await discover([schemaFile])
    const model = await buildDependencyModel(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
      fixtureRoot,
    )

    expect(model.schemaVersion).toBe(DEPENDENCY_MODEL_SCHEMA_VERSION)
    expect(model.contracts[0]?.file).toBe("payments/env.schema.ts")
    expect(model.contracts[0]?.consumingFiles).toEqual(["consumer.ts"])
  })

  it("maps ambiguousBarrelFiles to display paths and sorts them, not scan order", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const barrelFile = await write("payments/index.ts", `export * from "./env.schema.js";`)
    const zConsumer = await write(
      "z-consumer.ts",
      `import { paymentsEnv } from "./payments/index.js";\npaymentsEnv.STRIPE_KEY;\n`,
    )
    const aConsumer = await write(
      "a-consumer.ts",
      `import { paymentsEnv } from "./payments/index.js";\npaymentsEnv.STRIPE_KEY;\n`,
    )

    const contracts = await discover([schemaFile])
    const model = await buildDependencyModel(
      contracts,
      [schemaFile, barrelFile, zConsumer, aConsumer],
      readFile,
      context,
      fixtureRoot,
    )

    expect(model.contracts[0]?.ambiguousBarrelFiles).toEqual(["a-consumer.ts", "z-consumer.ts"])
  })

  it("threads per-access-site file:line:column positions through into the variable's model entry", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nconsole.log(paymentsEnv.STRIPE_KEY);\nif (paymentsEnv.STRIPE_KEY) {}\n`,
    )

    const contracts = await discover([schemaFile])
    const model = await buildDependencyModel(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
      fixtureRoot,
    )

    expect(model.contracts[0]?.variables).toEqual([
      {
        key: "STRIPE_KEY",
        status: "used",
        positions: [
          { file: "consumer.ts", line: 2, column: 13 },
          { file: "consumer.ts", line: 3, column: 5 },
        ],
        dynamicAccessAssertions: [],
      },
    ])
  })

  it("retains every dynamic-access site observed on a contract, not just a boolean", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nconst key = "STRIPE_KEY";\nconsole.log(paymentsEnv[key]);\n`,
    )

    const contracts = await discover([schemaFile])
    const model = await buildDependencyModel(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
      fixtureRoot,
    )

    expect(model.contracts[0]?.hasDynamicAccess).toBe(true)
    expect(model.contracts[0]?.dynamicAccessSites).toEqual([
      { file: "consumer.ts", line: 3, column: 13 },
    ])
  })

  it("defaults scannedSurfaces to a single application-root entry when none is passed", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )

    const contracts = await discover([schemaFile])
    const model = await buildDependencyModel(
      contracts,
      [schemaFile],
      readFile,
      context,
      fixtureRoot,
    )

    expect(model.scannedSurfaces).toEqual([{ label: "application", root: "." }])
  })

  it("threads a caller-supplied scannedSurfaces list straight through to the published model", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )

    const contracts = await discover([schemaFile])
    const surfaces = [
      { label: "application", root: "." },
      { label: "package:@acme/shared-contracts", root: "node_modules/@acme/shared-contracts" },
    ]
    const model = await buildDependencyModel(
      contracts,
      [schemaFile],
      readFile,
      context,
      fixtureRoot,
      surfaces,
    )

    expect(model.scannedSurfaces).toEqual(surfaces)
  })

  it("builds the inverse consumers index -- one entry per consuming file, listing every contract it reads", async () => {
    const paymentsSchema = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const dbSchema = await write(
      "database/env.schema.ts",
      `export const databaseEnv = createEnv({ DATABASE_URL: {} }, { name: "database" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nimport { databaseEnv } from "./database/env.schema.js";\npaymentsEnv.STRIPE_KEY;\ndatabaseEnv.DATABASE_URL;\n`,
    )

    const contracts = await discover([paymentsSchema, dbSchema])
    const model = await buildDependencyModel(
      contracts,
      [paymentsSchema, dbSchema, consumerFile],
      readFile,
      context,
      fixtureRoot,
    )

    expect(model.consumers).toEqual([
      {
        file: "consumer.ts",
        contracts: [
          { file: "database/env.schema.ts", exportName: "databaseEnv" },
          { file: "payments/env.schema.ts", exportName: "paymentsEnv" },
        ],
      },
    ])
    // The top-level model.contracts list is ALSO sorted -- discovered here
    // in payments-then-database order (declaration order passed to
    // `discover()` above), but the real, alphabetical order is the reverse.
    expect(model.contracts.map((c) => c.contractName)).toEqual(["database", "payments"])
  })

  it("omits a file from the consumers index entirely when it consumes nothing", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const unrelatedFile = await write("unrelated.ts", `export const noop = 1;\n`)

    const contracts = await discover([schemaFile])
    const model = await buildDependencyModel(
      contracts,
      [schemaFile, unrelatedFile],
      readFile,
      context,
      fixtureRoot,
    )

    expect(model.consumers).toEqual([])
  })
})

// D7 (plan Verification): a small fixture with the three access states the
// plan specifically calls for -- one member-accessed variable, one untouched
// variable, one accessed only via a computed `env[key]` -- with its
// generated positions checked against ground truth hand-counted from the
// raw source text below, not only asserted against itself. Hand count (each
// line 1-indexed, each column 1-indexed):
//   line 4: `console.log(paymentsEnv.STRIPE_KEY);`
//           "console.log(" is 12 characters, so `paymentsEnv` starts at
//           column 13 -- positionOf() reports the PropertyAccessExpression
//           node's own start, i.e. `paymentsEnv.STRIPE_KEY` as a whole.
//   line 5: `console.log(webhookEnv[key]);`
//           same "console.log(" prefix, so `webhookEnv[key]` (the
//           ElementAccessExpression) also starts at column 13.
// DATABASE_URL never appears in consumer.ts at all, so it has no positions.
describe("DependencyModel positions vs. hand-counted ground truth (plan Verification)", () => {
  it("matches hand-counted file:line:column for a used, an unconsumed, and an indeterminate (dynamic-only) variable", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      [
        `export const paymentsEnv = createEnv({ STRIPE_KEY: {}, DATABASE_URL: {} }, { name: "payments" });`,
        `export const webhookEnv = createEnv({ WEBHOOK_SECRET: {} }, { name: "webhook" });`,
      ].join("\n"),
    )
    const consumerFile = await write(
      "consumer.ts",
      [
        `import { paymentsEnv } from "./payments/env.schema.js";`,
        `import { webhookEnv } from "./payments/env.schema.js";`,
        `const key = "WEBHOOK_SECRET";`,
        `console.log(paymentsEnv.STRIPE_KEY);`,
        `console.log(webhookEnv[key]);`,
      ].join("\n"),
    )

    const contracts = await discover([schemaFile])
    const model = await buildDependencyModel(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
      fixtureRoot,
    )

    const payments = model.contracts.find((c) => c.contractName === "payments")
    const webhook = model.contracts.find((c) => c.contractName === "webhook")

    expect(payments?.variables).toEqual([
      { key: "DATABASE_URL", status: "unconsumed", positions: [], dynamicAccessAssertions: [] },
      {
        key: "STRIPE_KEY",
        status: "used",
        positions: [{ file: "consumer.ts", line: 4, column: 13 }],
        dynamicAccessAssertions: [],
      },
    ])
    expect(payments?.dynamicAccessSites).toEqual([])

    expect(webhook?.variables).toEqual([
      {
        key: "WEBHOOK_SECRET",
        status: "indeterminate",
        positions: [],
        dynamicAccessAssertions: [],
      },
    ])
    expect(webhook?.dynamicAccessSites).toEqual([{ file: "consumer.ts", line: 5, column: 13 }])
  })
})

// D7: an explicit schema/version compatibility proof for the ADR 0036 shape
// change (`lines` -> `positions`, schema version 1 -> 2) -- a real public-
// model change, not a cosmetic one, so it gets its own dedicated assertion
// rather than relying on the tests above alone.
describe("DependencyModel schema/version compatibility (ADR 0036)", () => {
  it("emits schema version 2, positions shaped as {file,line,column}, and no trace of the old lines field", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`,
    )
    const consumerFile = await write(
      "consumer.ts",
      `import { paymentsEnv } from "./payments/env.schema.js";\nconst key = "STRIPE_KEY";\nconsole.log(paymentsEnv.STRIPE_KEY);\nconsole.log(paymentsEnv[key]);\n`,
    )

    const contracts = await discover([schemaFile])
    const model = await buildDependencyModel(
      contracts,
      [schemaFile, consumerFile],
      readFile,
      context,
      fixtureRoot,
    )

    expect(DEPENDENCY_MODEL_SCHEMA_VERSION).toBe(2)
    expect(model.schemaVersion).toBe(2)

    const serialized = JSON.stringify(model)
    expect(serialized).not.toContain('"lines"')

    for (const contract of model.contracts) {
      for (const variable of contract.variables) {
        for (const position of variable.positions) {
          expect(typeof position.file).toBe("string")
          expect(typeof position.line).toBe("number")
          expect(typeof position.column).toBe("number")
        }
      }
      expect(Array.isArray(contract.dynamicAccessSites)).toBe(true)
    }

    expect(model.contracts[0]?.dynamicAccessSites).toEqual([
      { file: "consumer.ts", line: 4, column: 13 },
    ])
    expect(model.scannedSurfaces).toEqual([{ label: "application", root: "." }])
  })
})
