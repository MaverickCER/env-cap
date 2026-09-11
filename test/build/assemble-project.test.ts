import { nodeBuildFs } from "../support/build-filesystem.js"
import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { assembleProject } from "../../src/build/assemble-project.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(here, "fixtures-assemble-project")

async function writeJson(relativePath: string, value: unknown): Promise<void> {
  const filePath = path.join(fixtureRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8")
}

async function writeFile(relativePath: string, content: string): Promise<string> {
  const filePath = path.join(fixtureRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf8")
  return filePath
}

beforeAll(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
  await writeJson("package.json", { name: "fixture-root", private: true })

  await writeFile(
    "features/payments/env.schema.ts",
    `import { createEnv } from "env-cap";\nexport const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });\n`,
  )

  // A real allow-listed package with its own schema file, resolved via
  // node_modules -- same fixture shape as resolve-package-schema.test.ts's
  // own "simple-pkg".
  await writeJson("node_modules/@fixtures/billing-pkg/package.json", {
    name: "@fixtures/billing-pkg",
    main: "./dist/index.js",
    envCap: { schema: "./src/env.schema.ts" },
  })
  await writeFile("node_modules/@fixtures/billing-pkg/dist/index.js", "module.exports = {};\n")
  await writeFile(
    "node_modules/@fixtures/billing-pkg/src/env.schema.ts",
    `import { createEnv } from "env-cap";\nexport const billingEnv = createEnv({ INVOICE_KEY: {} }, { name: "billing" });\n`,
  )
})

afterAll(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
})

describe("assembleProject", () => {
  it("discovers local schema files with no packages/tsconfig requested", async () => {
    const result = await assembleProject({
      fs: nodeBuildFs,
      root: fixtureRoot,
      include: ["features/**/env.schema.ts"],
      exclude: [],
      packages: [],
      tsconfig: false,
    })

    expect(result.linkResult.contracts.map((c) => c.exportName)).toEqual(["paymentsEnv"])
    expect(result.packageWarnings).toEqual([])
    expect(result.tsconfigWarnings).toEqual([])
  })

  it("links a real allow-listed package's own schema file too -- the package's contract genuinely reaches linkFiles(), not just the local ones", async () => {
    const result = await assembleProject({
      fs: nodeBuildFs,
      root: fixtureRoot,
      include: ["features/**/env.schema.ts"],
      exclude: [],
      packages: ["@fixtures/billing-pkg"],
      tsconfig: false,
    })

    expect(result.linkResult.contracts.map((c) => c.exportName).sort()).toEqual([
      "billingEnv",
      "paymentsEnv",
    ])
    expect(result.packageWarnings).toEqual([])
  })

  it("carries a real tsconfig warning through when an explicit tsconfig path doesn't exist", async () => {
    const result = await assembleProject({
      fs: nodeBuildFs,
      root: fixtureRoot,
      include: ["features/**/env.schema.ts"],
      exclude: [],
      packages: [],
      tsconfig: "missing.tsconfig.json",
    })

    expect(result.tsconfigWarnings).toHaveLength(1)
    expect(result.tsconfigWarnings[0]?.message).toContain("missing.tsconfig.json")
  })

  it("carries no tsconfig warning when tsconfig is omitted and no default tsconfig.json exists", async () => {
    const result = await assembleProject({
      fs: nodeBuildFs,
      root: fixtureRoot,
      include: ["features/**/env.schema.ts"],
      exclude: [],
      packages: [],
      tsconfig: undefined,
    })

    expect(result.tsconfigWarnings).toEqual([])
  })
})
