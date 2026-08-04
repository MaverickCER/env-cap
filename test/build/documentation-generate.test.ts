import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { EnvDocumentationGenerationError } from "../../src/build/errors.js"
import { generateDocumentation } from "../../src/build/generate-documentation.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, "../..")
const runtimeIndex = path.resolve(projectRoot, "src/runtime/index.ts")
const fixtureRoot = path.resolve(here, "fixtures-documentation-generate")

async function writeFixture(relativeDir: string, source: string): Promise<void> {
  const dir = path.join(fixtureRoot, relativeDir)
  await fs.mkdir(dir, { recursive: true })
  const specifier = path.relative(dir, runtimeIndex).split(path.sep).join("/").replace(/\.ts$/, "")
  const normalized = specifier.startsWith(".") ? specifier : `./${specifier}`
  const content = `import { createEnv, documentEnv } from "${normalized}";\n\n${source}\n`
  await fs.writeFile(path.join(dir, "env.schema.ts"), content, "utf8")
}

describe("generateDocumentation", () => {
  beforeAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true })

    await writeFixture(
      "features/payments",
      `const paymentsSchema = { STRIPE_KEY: { processor: (v): string => String(v ?? "") } };
      export const paymentsEnv = createEnv(paymentsSchema, { name: "payments" });
      documentEnv(paymentsSchema, { variables: { STRIPE_KEY: { description: "Stripe secret key" } } });`,
    )

    // Deliberately left undocumented -- exercises `result.documentation.undocumentedContracts`.
    await writeFixture(
      "packages/database",
      `export const databaseEnv = createEnv({ PORT: { default: 3000, processor: (v): number => Number(v) } }, { name: "database" });`,
    )
  })

  afterAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true })
  })

  it("writes docs, reports undocumented findings, and never blocks on them by default", async () => {
    const result = await generateDocumentation({
      root: fixtureRoot,
      location: "docs/ENVIRONMENT.md",
    })

    expect(result.contracts).toHaveLength(2)
    const docsSource = await fs.readFile(result.docsPath, "utf8")
    expect(docsSource).toContain("<!-- AUTO-GENERATED FILE. DO NOT EDIT. -->")
    expect(docsSource).toContain("Stripe secret key")

    expect(result.documentation.undocumentedContracts).toEqual([
      {
        file: path.resolve(fixtureRoot, "packages/database/env.schema.ts"),
        exportName: "databaseEnv",
      },
    ])
    expect(result.documentation.undocumentedVariables).toEqual([
      {
        file: path.resolve(fixtureRoot, "packages/database/env.schema.ts"),
        exportName: "databaseEnv",
        key: "PORT",
      },
    ])
  })

  it("defaults root to process.cwd() when omitted", async () => {
    const originalCwd = process.cwd()
    process.chdir(fixtureRoot)
    try {
      const result = await generateDocumentation({ location: "docs/cwd-default.ENVIRONMENT.md" })
      expect(result.contracts).toHaveLength(2)
    } finally {
      process.chdir(originalCwd)
    }
  })

  it("throws EnvDocumentationGenerationError when onUndocumented is throw", async () => {
    await expect(
      generateDocumentation({
        root: fixtureRoot,
        location: "docs/strict.ENVIRONMENT.md",
        onUndocumented: "throw",
      }),
    ).rejects.toThrow(EnvDocumentationGenerationError)

    await expect(
      fs.access(path.resolve(fixtureRoot, "docs/strict.ENVIRONMENT.md")),
    ).rejects.toThrow()
  })

  it("reports 'No changes.' on the very first run too, and reads back the previous run to compute it on a second run", async () => {
    // A true first-ever run must already report "No changes." (not omit the
    // section) so that --check's "regenerate using what's currently on disk
    // as previousContent" comparison agrees with it -- see computeChangeSummary()'s
    // docstring in docs.ts.
    const options = { root: fixtureRoot, location: "docs/second-run.ENVIRONMENT.md" }
    const first = await generateDocumentation(options)
    const firstSource = await fs.readFile(first.docsPath, "utf8")
    expect(firstSource).toContain("## Changes since last report")
    expect(firstSource).toContain("No changes.")

    const second = await generateDocumentation(options)
    const secondSource = await fs.readFile(second.docsPath, "utf8")
    expect(secondSource).toContain("## Changes since last report")
    expect(secondSource).toContain("No changes.")
  })

  it("documents an inactive contract too (unlike the manifest)", async () => {
    await writeFixture(
      "features/db-active",
      `const schema = { DATABASE_URL: {} };
      export const dbActiveEnv = createEnv(schema, { name: "db-active" });
      documentEnv(schema, { category: "database", exclusiveGroup: "database" });`,
    )
    await writeFixture(
      "features/db-inactive",
      `const schema = { DATABASE_URL: {} };
      export const dbInactiveEnv = createEnv(schema, { name: "db-inactive" });
      documentEnv(schema, { category: "database", exclusiveGroup: "database", active: false });`,
    )

    const result = await generateDocumentation({
      root: fixtureRoot,
      location: "docs/active-inactive.ENVIRONMENT.md",
      include: ["features/db-active/**/env.schema.ts", "features/db-inactive/**/env.schema.ts"],
    })

    const docsSource = await fs.readFile(result.docsPath, "utf8")
    expect(docsSource).toContain("db-active")
    expect(docsSource).toContain("db-inactive")
    expect(docsSource).toContain("- Active: no")
  })

  it("reports an already-expired variable via result.documentation.expiringSoon", async () => {
    await writeFixture(
      "features/expiring",
      `const schema = { OLD_KEY: {} };
      export const expiringEnv = createEnv(schema, { name: "expiring" });
      documentEnv(schema, { variables: { OLD_KEY: { expiresAt: "2000-01-01" } } });`,
    )

    const result = await generateDocumentation({
      root: fixtureRoot,
      location: "docs/expiring.ENVIRONMENT.md",
      include: ["features/expiring/**/env.schema.ts"],
    })

    const entry = result.documentation.expiringSoon.find((e) => e.key === "OLD_KEY")
    expect(entry).toBeDefined()
    expect(entry?.daysRemaining).toBeLessThan(0)
  })

  it("exposes result.catalog with the full documentation content, not just the summary", async () => {
    await writeFixture(
      "features/catalog-rich",
      `const schema = { STRIPE_KEY: { validator: (v): boolean => typeof v === "string" } };
      export const richEnv = createEnv(schema, { name: "rich" });
      documentEnv(schema, {
        category: "Payments",
        owner: "payments-team",
        variables: {
          STRIPE_KEY: {
            description: "Stripe secret API key.",
            owner: "sysadmin@example.com",
            expiresAt: "2027-01-01",
            required: true,
            rotationCadence: "90 days",
            storageProvider: "AWS Secrets Manager",
            compliance: "PCI DSS",
          },
        },
      });`,
    )

    const result = await generateDocumentation({
      root: fixtureRoot,
      location: "docs/catalog-rich.ENVIRONMENT.md",
      include: ["features/catalog-rich/**/env.schema.ts"],
    })

    const entry = result.catalog.find((c) => c.exportName === "richEnv")
    expect(entry).toBeDefined()
    expect(entry?.category).toBe("Payments")
    expect(entry?.owner).toBe("payments-team")

    const variable = entry?.variables.STRIPE_KEY
    expect(variable).toBeDefined()
    expect(variable?.description).toBe("Stripe secret API key.")
    expect(variable?.owner).toBe("sysadmin@example.com")
    expect(variable?.expiresAt).toBe("2027-01-01")
    expect(variable?.required).toBe(true)
    expect(variable?.hasValidator).toBe(true)
    expect(variable?.extra).toEqual({
      rotationCadence: "90 days",
      storageProvider: "AWS Secrets Manager",
      compliance: "PCI DSS",
    })
  })

  it("reports a documentEnv() reference that cannot be statically linked as an unresolved link, not a throw", async () => {
    await writeFixture(
      "features/unresolvable-docs",
      `import { someSchema } from "some-package";
      documentEnv(someSchema, {});
      export const placeholderEnv = createEnv({ X: {} }, { name: "placeholder" });`,
    )

    const result = await generateDocumentation({
      root: fixtureRoot,
      location: "docs/unresolvable.ENVIRONMENT.md",
      include: ["features/unresolvable-docs/**/env.schema.ts"],
    })

    expect(result.documentation.unresolvedLinks.length).toBeGreaterThan(0)
  })

  it("never overwrites an existing .env.example, and reports stale variables it finds there", async () => {
    const exampleLocation = path.resolve(fixtureRoot, ".env.example.hand-written")
    await fs.writeFile(exampleLocation, "STRIPE_KEY=x\nPORT=1\nLEGACY_FEATURE_FLAG=true\n", "utf8")

    const result = await generateDocumentation({
      root: fixtureRoot,
      location: "docs/example-test.ENVIRONMENT.md",
      include: ["features/payments/**/env.schema.ts", "packages/database/**/env.schema.ts"],
      envExample: { location: ".env.example.hand-written" },
    })

    expect(result.envExample?.skippedExistingPath).toBe(exampleLocation)
    expect(result.envExample?.writtenPath).not.toBe(exampleLocation)
    expect(result.envExample?.staleVariables).toEqual(["LEGACY_FEATURE_FLAG"])

    const untouched = await fs.readFile(exampleLocation, "utf8")
    expect(untouched).toBe("STRIPE_KEY=x\nPORT=1\nLEGACY_FEATURE_FLAG=true\n")
  })

  describe("liveExpirationDates", () => {
    beforeAll(async () => {
      await writeFixture(
        "features/live-expiring",
        `const schema = { LIVE_KEY: {} };
        export const liveExpiringEnv = createEnv(schema, { name: "live-expiring" });
        documentEnv(schema, { variables: { LIVE_KEY: { expiresAt: "2099-01-01" } } });`,
      )
    })

    it("an override reaches both the rendered Markdown and documentation.expiringSoon; the static value alone would not have", async () => {
      const overrideDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()

      const result = await generateDocumentation({
        root: fixtureRoot,
        location: "docs/live-expiring.ENVIRONMENT.md",
        include: ["features/live-expiring/**/env.schema.ts"],
        liveExpirationDates: async (variableNames) => {
          expect(variableNames).toContain("LIVE_KEY")
          return { LIVE_KEY: overrideDate }
        },
      })

      const entry = result.documentation.expiringSoon.find((e) => e.key === "LIVE_KEY")
      expect(entry).toBeDefined()
      expect(entry?.expiresAt).toBe(overrideDate)

      const docsSource = await fs.readFile(result.docsPath, "utf8")
      expect(docsSource).toContain(overrideDate)
      expect(docsSource).not.toContain("2099-01-01")
    })

    it("an omitted liveExpirationDates leaves the static expiresAt untouched, in both places", async () => {
      const result = await generateDocumentation({
        root: fixtureRoot,
        location: "docs/live-expiring-omitted.ENVIRONMENT.md",
        include: ["features/live-expiring/**/env.schema.ts"],
      })

      expect(result.documentation.expiringSoon.find((e) => e.key === "LIVE_KEY")).toBeUndefined()
      const docsSource = await fs.readFile(result.docsPath, "utf8")
      expect(docsSource).toContain("2099-01-01")
    })

    it("propagates a rejecting callback's error unwrapped -- not an EnvDocumentationGenerationError", async () => {
      const failure = new Error("secrets manager unavailable")
      let caught: unknown
      try {
        await generateDocumentation({
          root: fixtureRoot,
          location: "docs/live-expiring-rejects.ENVIRONMENT.md",
          include: ["features/live-expiring/**/env.schema.ts"],
          liveExpirationDates: async () => {
            throw failure
          },
        })
      } catch (error) {
        caught = error
      }
      expect(caught).toBe(failure)
      expect(caught).not.toBeInstanceOf(EnvDocumentationGenerationError)
      await expect(
        fs.access(path.resolve(fixtureRoot, "docs/live-expiring-rejects.ENVIRONMENT.md")),
      ).rejects.toThrow()
    })
  })

  describe("output path safety", () => {
    it("rejects a relative `location` that escapes root via `..`", async () => {
      const outside = path.resolve(fixtureRoot, "..", "escaped-docs.md")
      await fs.rm(outside, { force: true })

      await expect(
        generateDocumentation({
          root: fixtureRoot,
          location: "../escaped-docs.md",
          include: ["features/payments/**/env.schema.ts"],
        }),
      ).rejects.toThrow(EnvDocumentationGenerationError)

      await expect(fs.access(outside)).rejects.toThrow()
    })

    it("rejects an absolute `location` outside root", async () => {
      const outside = path.join(os.tmpdir(), `env-cap-docs-escape-test-${Date.now()}.md`)
      await fs.rm(outside, { force: true })

      await expect(
        generateDocumentation({
          root: fixtureRoot,
          location: outside,
          include: ["features/payments/**/env.schema.ts"],
        }),
      ).rejects.toThrow(EnvDocumentationGenerationError)

      await expect(fs.access(outside)).rejects.toThrow()
    })

    it("rejects an escaping `envExample.location` even when `location` itself is valid, and writes nothing", async () => {
      const outside = path.resolve(fixtureRoot, "..", "escaped.env.example")
      await fs.rm(outside, { force: true })
      const docsLocation = path.resolve(fixtureRoot, "docs/env-example-escape-test.ENVIRONMENT.md")
      await fs.rm(docsLocation, { force: true })

      await expect(
        generateDocumentation({
          root: fixtureRoot,
          location: "docs/env-example-escape-test.ENVIRONMENT.md",
          envExample: { location: "../escaped.env.example" },
          include: ["features/payments/**/env.schema.ts"],
        }),
      ).rejects.toThrow(EnvDocumentationGenerationError)

      await expect(fs.access(outside)).rejects.toThrow()
      await expect(fs.access(docsLocation)).rejects.toThrow()
    })
  })
})
