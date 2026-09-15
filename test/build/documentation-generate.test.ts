import { nodeBuildFs } from "../support/build-filesystem.js"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { generatedBanner } from "../../src/build/generated-banner.js"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { EnvDocumentationGenerationError } from "../../src/build/errors.js"
import {
  findNonstandardSensitivityLevels,
  generateDocumentation,
  relativizeRef,
  STANDARD_SENSITIVITY_LEVELS,
} from "../../src/build/generate-documentation.js"
import type { DiscoveredContract } from "../../src/build/link.js"

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

  it("writes docs, reports undocumented findings, and never blocks on them (ADR 0038)", async () => {
    const result = await generateDocumentation({
      fs: nodeBuildFs,
      root: fixtureRoot,
      location: "docs/ENVIRONMENT.md",
    })

    expect(result.contracts).toHaveLength(2)
    // Exact per-field content, not just length -- proves `contractSummaries`
    // is a real `summarizeContract()` mapping, not e.g. every entry
    // collapsing to the same value.
    expect(result.contracts.find((c) => c.exportName === "paymentsEnv")).toEqual({
      file: "features/payments/env.schema.ts",
      exportName: "paymentsEnv",
      contractName: "payments",
      variableCount: 1,
      active: true,
      documented: true,
    })

    const docsSource = await fs.readFile(result.docsPath, "utf8")
    expect(docsSource).toContain(generatedBanner("markdown"))
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
    // The RENDERED docs' own "Undocumented." marker depends on a SEPARATE
    // map (`writeDocumentation()`'s own `relativizeRef()` calls over
    // `documentation.undocumentedContracts`) matching identity
    // (`${file}#${exportName}`) against the root-relative `ContractModel`
    // contracts `renderCatalog()` iterates -- if `relativizeRef()` ever lost
    // the `file` field, this identity match could never succeed for any
    // real contract, and the marker would silently never appear at all.
    expect(docsSource).toContain("⚠️ **Undocumented.**")
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
      const result = await generateDocumentation({
        fs: nodeBuildFs,
        location: "docs/cwd-default.ENVIRONMENT.md",
      })
      expect(result.contracts).toHaveLength(2)
    } finally {
      cwdSpy.mockRestore()
    }
  })

  it("reports 'No changes.' on the very first run too, and reads back the previous run to compute it on a second run", async () => {
    // A true first-ever run must already report "No changes." (not omit the
    // section) so that --check's "regenerate using what's currently on disk
    // as previousContent" comparison agrees with it -- see computeChangeSummary()'s
    // docstring in docs.ts.
    const options = {
      fs: nodeBuildFs,
      root: fixtureRoot,
      location: "docs/second-run.ENVIRONMENT.md",
    }
    const first = await generateDocumentation(options)
    const firstSource = await fs.readFile(first.docsPath, "utf8")
    expect(firstSource).toContain("## Changes since last report")
    expect(firstSource).toContain("No changes.")

    const second = await generateDocumentation(options)
    const secondSource = await fs.readFile(second.docsPath, "utf8")
    expect(secondSource).toContain("## Changes since last report")
    expect(secondSource).toContain("No changes.")
  })

  it("computes a real diff (a genuinely new key, not just re-reporting a fresh first-ever run) against the previously-written docs file on a second run", async () => {
    await writeFixture(
      "features/change-tracking",
      `const schema = { TRACKED_KEY: {} };
      export const trackedEnv = createEnv(schema, { name: "tracked" });
      documentEnv(schema, { variables: { TRACKED_KEY: { description: "v1" } } });`,
    )
    const options = {
      fs: nodeBuildFs,
      root: fixtureRoot,
      location: "docs/change-tracking.ENVIRONMENT.md",
      include: ["features/change-tracking/**/env.schema.ts"],
    }
    const first = await generateDocumentation(options)
    const firstSource = await fs.readFile(first.docsPath, "utf8")
    expect(firstSource).toContain("No changes.")

    // A genuinely NEW key, not just an edited field -- `computeChangeSummary()`
    // diffs the previous report's own documented *headings* (variable keys),
    // never field-level content like `description`.
    await writeFixture(
      "features/change-tracking",
      `const schema = { TRACKED_KEY: {}, NEW_KEY: {} };
      export const trackedEnv = createEnv(schema, { name: "tracked" });
      documentEnv(schema, {
        variables: { TRACKED_KEY: { description: "v1" }, NEW_KEY: { description: "new" } },
      });`,
    )
    const second = await generateDocumentation(options)
    const secondSource = await fs.readFile(second.docsPath, "utf8")
    // If `previousContent` were never actually read back from disk (the
    // second run treated as if there were no previous run at all), this
    // would report NOTHING changed (a true first run's own definition of
    // "no previous content" is treated as "nothing changed", not "everything
    // added" -- see computeChangeSummary()'s own doc comment) instead of a
    // real, specific "Added: `NEW_KEY`" diff against what's really on disk.
    expect(secondSource).not.toContain("No changes.")
    expect(secondSource).toContain("**Added:** `NEW_KEY`")
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
      fs: nodeBuildFs,
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
      fs: nodeBuildFs,
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
            metadata: {
              rotationCadence: "90 days",
              storageProvider: "AWS Secrets Manager",
              compliance: "PCI DSS",
            },
          },
        },
      });`,
    )

    const result = await generateDocumentation({
      fs: nodeBuildFs,
      root: fixtureRoot,
      location: "docs/catalog-rich.ENVIRONMENT.md",
      include: ["features/catalog-rich/**/env.schema.ts"],
    })

    const entry = result.catalog.find((c) => c.exportName === "richEnv")
    expect(entry).toBeDefined()
    expect(entry?.category).toBe("Payments")
    expect(entry?.owner).toBe("payments-team")

    const variable = entry?.variables["STRIPE_KEY"]
    expect(variable).toBeDefined()
    expect(variable?.description).toBe("Stripe secret API key.")
    expect(variable?.owner).toBe("sysadmin@example.com")
    expect(variable?.expiresAt).toBe("2027-01-01")
    expect(variable?.required).toBe(true)
    expect(variable?.hasValidator).toBe(true)
    expect(variable?.metadata).toEqual({
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
      fs: nodeBuildFs,
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
      fs: nodeBuildFs,
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
        fs: nodeBuildFs,
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
        fs: nodeBuildFs,
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
          fs: nodeBuildFs,
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

  it("omits any packages report entirely when options.packages is omitted -- exactly the one real (non-package) warning shows, no spurious `(package) ...` entry", async () => {
    // An unresolvable schema factory reference -- `link.ts` can't statically
    // evaluate `someFactory()`, so it emits a real parse warning, distinct
    // from any `(package) <name>` warning `resolveAllowlistedPackages()`
    // would emit for an unresolvable *package name*.
    await writeFixture("features/odd", `export const oddEnv = createEnv(someFactory());`)

    const result = await generateDocumentation({
      fs: nodeBuildFs,
      root: fixtureRoot,
      location: "docs/odd.ENVIRONMENT.md",
      include: ["features/odd/**/env.schema.ts"],
    })

    expect(result.parseWarnings).toHaveLength(1)
    expect(result.parseWarnings.some((w) => w.file.startsWith("(package)"))).toBe(false)
  })

  describe("output path safety", () => {
    it("rejects a relative `location` that escapes root via `..`, naming the offending option/function and carrying exactly one issue", async () => {
      const outside = path.resolve(fixtureRoot, "..", "escaped-docs.md")
      await fs.rm(outside, { force: true })

      let caught: unknown
      try {
        await generateDocumentation({
          fs: nodeBuildFs,
          root: fixtureRoot,
          location: "../escaped-docs.md",
          include: ["features/payments/**/env.schema.ts"],
        })
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(EnvDocumentationGenerationError)
      const docsError = caught as EnvDocumentationGenerationError
      expect(docsError.issues).toHaveLength(1)
      expect(docsError.issues[0]?.reason).toContain('"location"')
      expect(docsError.issues[0]?.reason).toContain("generateDocumentation()")

      await expect(fs.access(outside)).rejects.toThrow()
    })

    it("rejects an absolute `location` outside root", async () => {
      const outside = path.join(os.tmpdir(), `env-cap-docs-escape-test-${Date.now()}.md`)
      await fs.rm(outside, { force: true })

      await expect(
        generateDocumentation({
          fs: nodeBuildFs,
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

      let caught: unknown
      try {
        await generateDocumentation({
          fs: nodeBuildFs,
          root: fixtureRoot,
          location: "docs/env-example-escape-test.ENVIRONMENT.md",
          envExample: { location: "../escaped.env.example" },
          include: ["features/payments/**/env.schema.ts"],
        })
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(EnvDocumentationGenerationError)
      const docsError = caught as EnvDocumentationGenerationError
      expect(docsError.issues).toHaveLength(1)
      expect(docsError.issues[0]?.reason).toContain('"envExample.location"')
      expect(docsError.issues[0]?.reason).toContain("generateDocumentation()")

      await expect(fs.access(outside)).rejects.toThrow()
      await expect(fs.access(docsLocation)).rejects.toThrow()
    })
  })
})

describe("findNonstandardSensitivityLevels", () => {
  const contract = (
    sensitivity: string | undefined,
    variables: { key: string; sensitivity?: string }[],
  ): DiscoveredContract =>
    ({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      contractName: "a",
      active: true,
      sensitivity,
      owner: undefined,
      variables: variables.map((v) => ({ key: v.key, sensitivity: v.sensitivity })),
    }) as unknown as DiscoveredContract

  it("returns nothing when every declared level is one of the standard four", () => {
    // Hardcoded literals, not `[...STANDARD_SENSITIVITY_LEVELS]` -- spreading
    // the very Set under test would make this tautological: a mutant that
    // corrupts one of the Set's own literal entries would corrupt this
    // test's INPUT the exact same way, so the assertion would trivially
    // keep passing regardless of what the Set actually contains.
    for (const level of ["secret", "credential", "pii", "config"]) {
      expect(findNonstandardSensitivityLevels([contract(level, [{ key: "K" }])])).toEqual([])
    }
    expect(STANDARD_SENSITIVITY_LEVELS).toEqual(new Set(["secret", "credential", "pii", "config"]))
    expect(
      findNonstandardSensitivityLevels([contract(undefined, [{ key: "K", sensitivity: "pii" }])]),
    ).toEqual([])
  })

  it("returns nothing when nothing declares a sensitivity at all", () => {
    expect(findNonstandardSensitivityLevels([contract(undefined, [{ key: "K" }])])).toEqual([])
  })

  it("reports a contract-level nonstandard level with key: undefined", () => {
    expect(findNonstandardSensitivityLevels([contract("top-secret", [])])).toEqual([
      {
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        key: undefined,
        sensitivity: "top-secret",
      },
    ])
  })

  it("reports a variable-level nonstandard level, naming the variable", () => {
    expect(
      findNonstandardSensitivityLevels([
        contract(undefined, [{ key: "TOKEN", sensitivity: "restricted" }]),
      ]),
    ).toEqual([
      {
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        key: "TOKEN",
        sensitivity: "restricted",
      },
    ])
  })

  it("never reports a variable for merely inheriting its contract's nonstandard level", () => {
    // The contract itself is reported once; the two variables inherit that
    // same level and must not each repeat it -- see the function's own note.
    const entries = findNonstandardSensitivityLevels([
      contract("top-secret", [{ key: "A" }, { key: "B" }]),
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0]?.key).toBeUndefined()
  })

  it("reports both levels when a variable overrides a nonstandard contract level with another", () => {
    expect(
      findNonstandardSensitivityLevels([
        contract("top-secret", [{ key: "A", sensitivity: "ultra" }]),
      ]).map((e) => [e.key, e.sensitivity]),
    ).toEqual([
      [undefined, "top-secret"],
      ["A", "ultra"],
    ])
  })

  it("sorts nonstandard variable-level entries by key, regardless of declaration order", () => {
    expect(
      findNonstandardSensitivityLevels([
        contract(undefined, [
          { key: "Z_VAR", sensitivity: "ultra" },
          { key: "A_VAR", sensitivity: "top-secret" },
        ]),
      ]).map((e) => e.key),
    ).toEqual(["A_VAR", "Z_VAR"])
  })
})

describe("relativizeRef", () => {
  it("root-relativizes only the file field, preserving every other field unchanged", () => {
    const ref = { file: "/repo/features/payments/env.schema.ts", exportName: "paymentsEnv" }
    expect(relativizeRef("/repo", ref)).toEqual({
      file: "features/payments/env.schema.ts",
      exportName: "paymentsEnv",
    })
  })
})
