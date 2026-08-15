import { describe, it, expect, beforeEach, afterEach } from "vitest"
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

  it("threads per-access-site line numbers through into the variable's model entry", async () => {
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
      { key: "STRIPE_KEY", status: "used", lines: [2, 3] },
    ])
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
          { file: "database/env.schema.ts", exportName: "databaseEnv", contractName: "database" },
          { file: "payments/env.schema.ts", exportName: "paymentsEnv", contractName: "payments" },
        ],
      },
    ])
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
