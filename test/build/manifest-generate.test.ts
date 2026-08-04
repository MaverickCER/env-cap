import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { EnvManifestGenerationError } from "../../src/build/errors.js"
import { generateEnvArtifacts } from "../../src/build/generate-env-artifacts.js"
import { generateEnvManifest } from "../../src/build/generate-manifest.js"
import { validateEnv } from "../../src/runtime/validate.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, "../..")
const runtimeIndex = path.resolve(projectRoot, "src/runtime/index.ts")
const fixtureRoot = path.resolve(here, "fixtures-manifest-generate")

async function writeFixture(relativeDir: string, source: string): Promise<void> {
  const dir = path.join(fixtureRoot, relativeDir)
  await fs.mkdir(dir, { recursive: true })
  const specifier = path.relative(dir, runtimeIndex).split(path.sep).join("/").replace(/\.ts$/, "")
  const normalized = specifier.startsWith(".") ? specifier : `./${specifier}`
  const content = `import { createEnv, documentEnv } from "${normalized}";\n\n${source}\n`
  await fs.writeFile(path.join(dir, "env.schema.ts"), content, "utf8")
}

describe("generateEnvManifest (real filesystem, no code execution during generation)", () => {
  beforeAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true })

    await writeFixture(
      "features/payments",
      `const paymentsSchema = {
        STRIPE_KEY: {
          processor: (value): string => String(value ?? ""),
          validator: (value, rawEnv) => {
            if (rawEnv.PAYMENT_PROVIDER !== "stripe") return true;
            return value.length > 0 || "Stripe key is required.";
          },
        },
      };
      export const paymentsEnv = createEnv(paymentsSchema, { name: "payments" });
      documentEnv(paymentsSchema, { variables: { STRIPE_KEY: { description: "Stripe secret key" } } });`,
    )

    await writeFixture(
      "packages/database",
      `export const databaseEnv = createEnv(
        {
          PORT: {
            default: 3000,
            processor: (value): number => Number(value),
            validator: (value) => (value >= 1 && value <= 65535) || "PORT must be between 1 and 65535.",
          },
        },
        { name: "database" },
      );`,
    )
  })

  afterAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true })
  })

  it("discovers both contracts, writes a deterministic manifest, and round-trips through validateEnv", async () => {
    const result = await generateEnvManifest({
      root: fixtureRoot,
      location: "src/generated/env.manifest.ts",
    })

    expect(result.contracts).toHaveLength(2)
    expect(result.warnings).toHaveLength(0)
    expect(result.parseWarnings).toHaveLength(0)

    const manifestSource = await fs.readFile(result.outputPath, "utf8")
    expect(manifestSource).toContain("// AUTO-GENERATED FILE.")
    expect(manifestSource).toContain("paymentsEnv")
    expect(manifestSource).toContain("databaseEnv")

    expect(result.contracts.find((c) => c.exportName === "paymentsEnv")?.documented).toBe(true)
    expect(result.contracts.find((c) => c.exportName === "databaseEnv")?.documented).toBe(false)

    const manifestModule = (await import(pathToFileURL(result.outputPath).href)) as {
      manifest: [{ STRIPE_KEY: string }, { PORT: number }]
    }
    expect(manifestModule.manifest).toHaveLength(2)

    await validateEnv({
      values: { PAYMENT_PROVIDER: "stripe", STRIPE_KEY: "sk_live_123", PORT: "8080" },
      manifest: manifestModule.manifest,
    })

    const [paymentsEnv, databaseEnv] = manifestModule.manifest
    expect(paymentsEnv.STRIPE_KEY).toBe("sk_live_123")
    expect(databaseEnv.PORT).toBe(8080)
  })

  it("defaults root to process.cwd() when omitted", async () => {
    const originalCwd = process.cwd()
    process.chdir(fixtureRoot)
    try {
      const result = await generateEnvManifest({
        location: "src/generated/cwd-default.manifest.ts",
      })
      expect(result.contracts).toHaveLength(2)
    } finally {
      process.chdir(originalCwd)
    }
  })

  it("throws EnvManifestGenerationError and writes nothing when two processors declare conflicting return types", async () => {
    await writeFixture(
      "features/conflict-a",
      `export const conflictAEnv = createEnv({ SHARED_FLAG: { processor: (v): string => String(v) } });`,
    )
    await writeFixture(
      "features/conflict-b",
      `export const conflictBEnv = createEnv({ SHARED_FLAG: { processor: (v): boolean => Boolean(v) } });`,
    )

    const location = "src/generated/conflict.manifest.ts"
    await expect(
      generateEnvManifest({
        root: fixtureRoot,
        location,
        include: ["features/conflict-*/env.schema.ts"],
      }),
    ).rejects.toThrow(EnvManifestGenerationError)

    await expect(fs.access(path.resolve(fixtureRoot, location))).rejects.toThrow()
  })

  it("onIncompatibility: throw escalates an ordinary warning-severity issue too, not just provable errors", async () => {
    // Differing processor implementations with no return-type annotations are
    // only ever a "warning" (unprovable via static analysis alone) -- confirms
    // `onIncompatibility: throw` escalates *all* issues, not only the
    // always-blocking "error"-severity ones the conflicting-return-type test
    // above already covers.
    await writeFixture(
      "features/warn-a",
      `export const warnAEnv = createEnv({ SOFT_FLAG: { processor: (v) => String(v) } });`,
    )
    await writeFixture(
      "features/warn-b",
      `export const warnBEnv = createEnv({ SOFT_FLAG: { processor: (v) => v } });`,
    )

    const location = "src/generated/warn-throw.manifest.ts"
    await expect(
      generateEnvManifest({
        root: fixtureRoot,
        location,
        include: ["features/warn-*/env.schema.ts"],
        onIncompatibility: "throw",
      }),
    ).rejects.toThrow(EnvManifestGenerationError)

    await expect(fs.access(path.resolve(fixtureRoot, location))).rejects.toThrow()
  })

  it("is deterministic: re-running generation against the same files produces byte-identical output", async () => {
    const options = {
      root: fixtureRoot,
      location: "src/generated/full.manifest.ts",
      include: ["features/payments/**/env.schema.ts", "packages/database/**/env.schema.ts"],
    }

    const result1 = await generateEnvManifest(options)
    const result2 = await generateEnvManifest(options)

    const source1 = await fs.readFile(result1.outputPath, "utf8")
    const source2 = await fs.readFile(result2.outputPath, "utf8")
    expect(source1).toBe(source2)
  })

  it("throws EnvManifestGenerationError when two ACTIVE contracts share an exclusiveGroup", async () => {
    await writeFixture(
      "features/group-conflict-a",
      `const schema = { X: {} };
      export const groupConflictAEnv = createEnv(schema, { name: "group-a" });
      documentEnv(schema, { exclusiveGroup: "grp" });`,
    )
    await writeFixture(
      "features/group-conflict-b",
      `const schema = { X: {} };
      export const groupConflictBEnv = createEnv(schema, { name: "group-b" });
      documentEnv(schema, { exclusiveGroup: "grp" });`,
    )

    const location = "src/generated/group-conflict.manifest.ts"
    await expect(
      generateEnvManifest({
        root: fixtureRoot,
        location,
        include: ["features/group-conflict-*/env.schema.ts"],
      }),
    ).rejects.toThrow(EnvManifestGenerationError)

    await expect(fs.access(path.resolve(fixtureRoot, location))).rejects.toThrow()
  })

  it("excludes an inactive contract from the manifest, though both are still discovered/reported", async () => {
    await writeFixture(
      "features/db-active",
      `const schema = { DATABASE_URL: { processor: (v): string => String(v ?? "") } };
      export const dbActiveEnv = createEnv(schema, { name: "db-active" });
      documentEnv(schema, { category: "database", exclusiveGroup: "database" });`,
    )
    await writeFixture(
      "features/db-inactive",
      `const schema = { DATABASE_URL: { processor: (v): string => String(v ?? "") } };
      export const dbInactiveEnv = createEnv(schema, { name: "db-inactive" });
      documentEnv(schema, { category: "database", exclusiveGroup: "database", active: false });`,
    )

    const result = await generateEnvManifest({
      root: fixtureRoot,
      location: "src/generated/active-inactive.manifest.ts",
      include: ["features/db-active/**/env.schema.ts", "features/db-inactive/**/env.schema.ts"],
    })

    expect(result.contracts).toHaveLength(2)
    expect(result.contracts.find((c) => c.contractName === "db-active")?.active).toBe(true)
    expect(result.contracts.find((c) => c.contractName === "db-inactive")?.active).toBe(false)

    const manifestModule = (await import(pathToFileURL(result.outputPath).href)) as {
      manifest: [{ DATABASE_URL: string }]
    }
    expect(manifestModule.manifest).toHaveLength(1)
  })

  describe("manifest change-tracking (documentEnv metadata added/removed/updated since last execution -- see ADR 0021)", () => {
    // Uses generateEnvArtifacts(), not bare generateEnvManifest(), so this
    // matches how a real project actually triggers this (its generate:env
    // script). envExample.onExisting: "skip" keeps that unrelated artifact
    // out of the picture across the three repeated calls below -- the
    // default "keep-sibling" would otherwise spam a fresh timestamped
    // sibling file on every call, which this scenario has no interest in.
    const dir = "features/changes-demo"
    const location = "src/generated/changes-demo.manifest.ts"
    const artifactsOptions = {
      root: fixtureRoot,
      include: [`${dir}/**/env.schema.ts`],
      manifest: { location },
      docs: {
        location: "docs/changes-demo.md",
        envExample: { location: ".env.example.changes-demo", onExisting: "skip" as const },
      },
    }

    it("reports everything as added on the first run, nothing on an unchanged second run, and field-level updates after a documentEnv() edit", async () => {
      await writeFixture(
        dir,
        `const schema = { WEBHOOK_URL: {} };
        export const changesDemoEnv = createEnv(schema, { name: "changes-demo" });
        documentEnv(schema, { owner: "team-a", variables: { WEBHOOK_URL: { description: "v1", owner: "team-a" } } });`,
      )

      const first = await generateEnvArtifacts(artifactsOptions)
      const firstChanges = first.manifest?.changes
      expect(firstChanges?.addedContracts).toHaveLength(1)
      expect(firstChanges?.addedContracts[0]?.contractName).toBe("changes-demo")
      expect(firstChanges?.addedVariables).toHaveLength(1)
      expect(firstChanges?.addedVariables[0]?.key).toBe("WEBHOOK_URL")
      expect(firstChanges?.updatedContracts).toHaveLength(0)
      expect(firstChanges?.updatedVariables).toHaveLength(0)
      expect(firstChanges?.removedContracts).toHaveLength(0)
      expect(firstChanges?.removedVariables).toHaveLength(0)

      const snapshotPath = path.resolve(
        fixtureRoot,
        "src/generated/changes-demo.manifest.snapshot.json",
      )
      await expect(fs.access(snapshotPath)).resolves.toBeUndefined()

      // Second run against the exact same source: nothing changed at all.
      const second = await generateEnvArtifacts(artifactsOptions)
      const secondChanges = second.manifest?.changes
      expect(secondChanges?.addedContracts).toHaveLength(0)
      expect(secondChanges?.addedVariables).toHaveLength(0)
      expect(secondChanges?.updatedContracts).toHaveLength(0)
      expect(secondChanges?.updatedVariables).toHaveLength(0)
      expect(secondChanges?.removedContracts).toHaveLength(0)
      expect(secondChanges?.removedVariables).toHaveLength(0)

      // Third run: documentEnv() metadata edited (description and owner both change).
      await writeFixture(
        dir,
        `const schema = { WEBHOOK_URL: {} };
        export const changesDemoEnv = createEnv(schema, { name: "changes-demo" });
        documentEnv(schema, { owner: "team-a", variables: { WEBHOOK_URL: { description: "v2", owner: "team-b" } } });`,
      )

      const third = await generateEnvArtifacts(artifactsOptions)
      const thirdChanges = third.manifest?.changes
      expect(thirdChanges?.addedContracts).toHaveLength(0)
      expect(thirdChanges?.addedVariables).toHaveLength(0)
      expect(thirdChanges?.removedContracts).toHaveLength(0)
      expect(thirdChanges?.removedVariables).toHaveLength(0)
      expect(thirdChanges?.updatedContracts).toHaveLength(0)
      expect(thirdChanges?.updatedVariables).toHaveLength(1)

      const variableUpdate = thirdChanges?.updatedVariables[0]
      expect(variableUpdate?.key).toBe("WEBHOOK_URL")
      expect(variableUpdate?.contractName).toBe("changes-demo")
      expect(variableUpdate?.changes).toEqual(
        expect.arrayContaining([
          { field: "description", previous: "v1", current: "v2" },
          { field: "owner", previous: "team-a", current: "team-b" },
        ]),
      )

      // onExisting: "skip" kept every call after the first from touching
      // .env.example.changes-demo again -- exactly one file, no timestamped
      // siblings, even though generation ran three times against it.
      const envExampleSiblings = (await fs.readdir(fixtureRoot)).filter((name) =>
        name.startsWith(".env.example.changes-demo"),
      )
      expect(envExampleSiblings).toEqual([".env.example.changes-demo"])
    })
  })

  describe("output path safety", () => {
    it("still succeeds for a normally-nested output location (baseline)", async () => {
      const result = await generateEnvManifest({
        root: fixtureRoot,
        location: "deeply/nested/generated/env.manifest.ts",
        include: ["features/payments/**/env.schema.ts"],
      })
      expect(result.outputPath).toBe(
        path.resolve(fixtureRoot, "deeply/nested/generated/env.manifest.ts"),
      )
      await expect(fs.access(result.outputPath)).resolves.toBeUndefined()
    })

    it("rejects a relative `location` that escapes root via `..`", async () => {
      const outside = path.resolve(fixtureRoot, "..", "escaped-manifest.ts")
      await fs.rm(outside, { force: true })

      await expect(
        generateEnvManifest({
          root: fixtureRoot,
          location: "../escaped-manifest.ts",
          include: ["features/payments/**/env.schema.ts"],
        }),
      ).rejects.toThrow(EnvManifestGenerationError)

      await expect(fs.access(outside)).rejects.toThrow()
    })

    it("rejects an absolute `location` outside root", async () => {
      const outside = path.join(os.tmpdir(), `env-cap-manifest-escape-test-${Date.now()}.ts`)
      await fs.rm(outside, { force: true })

      await expect(
        generateEnvManifest({
          root: fixtureRoot,
          location: outside,
          include: ["features/payments/**/env.schema.ts"],
        }),
      ).rejects.toThrow(EnvManifestGenerationError)

      await expect(fs.access(outside)).rejects.toThrow()
    })
  })
})
