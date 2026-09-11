import { nodeBuildFs } from "../support/build-filesystem.js"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  computeSourceFingerprint,
  getEvidenceModel,
  writeEvidenceFingerprint,
} from "../../src/build/evidence-cache.js"
import { EVIDENCE_MODEL_SCHEMA_VERSION } from "../../src/build/evidence-model.js"
import { generateEvidenceModel } from "../../src/build/generate-evidence.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(here, "fixtures-evidence-cache")
const fingerprintOptions = {
  fs: nodeBuildFs,
  root: fixtureRoot,
  include: ["**/env.schema.ts"],
  exclude: [],
  packages: [],
}

async function write(relativePath: string, content: string): Promise<string> {
  const filePath = path.join(fixtureRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf8")
  return filePath
}

async function writeJson(relativePath: string, value: unknown): Promise<void> {
  await write(relativePath, JSON.stringify(value, null, 2))
}

beforeEach(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
  await write(
    "features/payments/env.schema.ts",
    `const paymentsSchema = { STRIPE_KEY: {} };
    export const paymentsEnv = createEnv(paymentsSchema, { name: "payments" });
    documentEnv(paymentsSchema, { owner: "payments-team" });`,
  )
})

afterEach(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
})

describe("computeSourceFingerprint", () => {
  it("changes when an allow-listed package's own schema file content changes -- package files really feed the hash, not silently dropped", async () => {
    await writeJson("node_modules/@fixtures/pkg/package.json", {
      name: "@fixtures/pkg",
      envCap: { schema: "./src/env.schema.ts" },
    })
    await write(
      "node_modules/@fixtures/pkg/src/env.schema.ts",
      `export const pkgSchema = { PKG_VAR: {} };`,
    )
    const options = { ...fingerprintOptions, packages: ["@fixtures/pkg"] }
    const before = await computeSourceFingerprint(options)

    await write(
      "node_modules/@fixtures/pkg/src/env.schema.ts",
      `export const pkgSchema = { PKG_VAR: {}, ANOTHER_VAR: {} };`,
    )
    const after = await computeSourceFingerprint(options)

    expect(after).not.toBe(before)
  })

  it("is deterministic for the same, unchanged source tree", async () => {
    const first = await computeSourceFingerprint(fingerprintOptions)
    const second = await computeSourceFingerprint(fingerprintOptions)
    expect(first).toBe(second)
  })

  it("is independent of the order allow-listed packages are discovered in -- the merged file list is sorted before hashing, not hashed in discovery order", async () => {
    // `packageFiles`'s own order mirrors `options.packages`'s array order
    // (`resolveAllowlistedPackages()` resolves via `Promise.all` over that
    // same array) -- two packages, requested in opposite orders, would feed
    // the running hash their file/content pairs in opposite sequence if the
    // merged list were never sorted, producing two DIFFERENT digests for
    // the exact same underlying source tree.
    await writeJson("node_modules/@fixtures/pkg-a/package.json", {
      name: "@fixtures/pkg-a",
      envCap: { schema: "./env.schema.ts" },
    })
    await write(
      "node_modules/@fixtures/pkg-a/env.schema.ts",
      `export const aSchema = { A_VAR: {} };`,
    )
    await writeJson("node_modules/@fixtures/pkg-z/package.json", {
      name: "@fixtures/pkg-z",
      envCap: { schema: "./env.schema.ts" },
    })
    await write(
      "node_modules/@fixtures/pkg-z/env.schema.ts",
      `export const zSchema = { Z_VAR: {} };`,
    )

    const forward = await computeSourceFingerprint({
      ...fingerprintOptions,
      packages: ["@fixtures/pkg-a", "@fixtures/pkg-z"],
    })
    const reverse = await computeSourceFingerprint({
      ...fingerprintOptions,
      packages: ["@fixtures/pkg-z", "@fixtures/pkg-a"],
    })
    expect(forward).toBe(reverse)
  })

  it("changes when a scanned file's content changes", async () => {
    const before = await computeSourceFingerprint(fingerprintOptions)
    await write(
      "features/payments/env.schema.ts",
      `const paymentsSchema = { STRIPE_KEY: {}, STRIPE_WEBHOOK_SECRET: {} };
      export const paymentsEnv = createEnv(paymentsSchema, { name: "payments" });
      documentEnv(paymentsSchema, { owner: "payments-team" });`,
    )
    const after = await computeSourceFingerprint(fingerprintOptions)
    expect(after).not.toBe(before)
  })

  it("changes when an unrelated .ts file inside root's scan surface is added", async () => {
    const before = await computeSourceFingerprint(fingerprintOptions)
    await write("src/unrelated.ts", "export const x = 1;\n")
    const after = await computeSourceFingerprint(fingerprintOptions)
    expect(after).not.toBe(before)
  })

  it("folds in a distinct '(unreadable)' marker for a file the walk found but can't read by hash time -- exactly as if it had real content literally equal to that marker", async () => {
    // Same filename, same file SET either way -- the only variable is
    // whether the read succeeds. Comparing against a REAL file containing
    // the literal marker text (rather than trying to replicate the whole
    // `allFiles` set -- which also picks up the beforeEach fixture's own
    // schema file via the usage-scan surface, not just `include` -- by
    // hand) isolates exactly the one thing under test: an unreadable file
    // is hashed AS IF its content were "(unreadable)". An empty catch, or
    // one that hashes "" instead, would both be indistinguishable from a
    // no-op given hashing an empty string adds zero bytes -- so this also
    // proves the marker isn't silently dropped.
    const unreadablePath = await write("solo/unreadable.ts", "export const x = 1;\n")
    const options = { ...fingerprintOptions, include: ["**/env.schema.ts", "solo/unreadable.ts"] }

    await fs.chmod(unreadablePath, 0o000)
    let unreadableFingerprint: string
    try {
      unreadableFingerprint = await computeSourceFingerprint(options)
    } finally {
      // Best-effort cleanup in case computeSourceFingerprint itself threw.
      await fs.chmod(unreadablePath, 0o644).catch(() => undefined)
    }

    await write("solo/unreadable.ts", "(unreadable)")
    const markerContentFingerprint = await computeSourceFingerprint(options)

    expect(unreadableFingerprint).toBe(markerContentFingerprint)
  })
})

describe("getEvidenceModel", () => {
  const location = "docs/env.evidence.json"
  const evidencePath = path.join(fixtureRoot, location)

  it("hits the cache and returns the committed artifact unchanged when the fingerprint matches", async () => {
    const evidence = await generateEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot })
    await fs.mkdir(path.dirname(evidencePath), { recursive: true })
    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8")
    const fingerprint = await computeSourceFingerprint(fingerprintOptions)
    await writeEvidenceFingerprint(evidencePath, fingerprint, nodeBuildFs)

    const result = await getEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot, location })

    expect(result.source).toBe("hit")
    expect(result.missReason).toBeUndefined()
    expect(result.evidence).toEqual(evidence)
  })

  it("misses and recomputes when no .fingerprint sidecar exists at all", async () => {
    const result = await getEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot, location })

    expect(result.source).toBe("miss")
    expect(result.missReason).toContain("no fingerprint sidecar found")
    expect(result.evidence.schemaVersion).toBe(EVIDENCE_MODEL_SCHEMA_VERSION)
  })

  it("misses and recomputes when the fingerprint no longer matches the current source tree", async () => {
    await fs.mkdir(path.dirname(evidencePath), { recursive: true })
    await writeEvidenceFingerprint(evidencePath, "not-a-real-fingerprint", nodeBuildFs)

    const result = await getEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot, location })

    expect(result.source).toBe("miss")
    expect(result.missReason).toContain(
      "source fingerprint changed since the committed evidence artifact was last generated",
    )
  })

  it("misses and recomputes when the fingerprint matches but no evidence artifact exists yet", async () => {
    const fingerprint = await computeSourceFingerprint(fingerprintOptions)
    await fs.mkdir(path.dirname(evidencePath), { recursive: true })
    await writeEvidenceFingerprint(evidencePath, fingerprint, nodeBuildFs)

    const result = await getEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot, location })

    expect(result.source).toBe("miss")
    expect(result.missReason).toContain("no evidence artifact found")
  })

  it("misses and recomputes when the committed artifact isn't valid JSON", async () => {
    const fingerprint = await computeSourceFingerprint(fingerprintOptions)
    await fs.mkdir(path.dirname(evidencePath), { recursive: true })
    await writeEvidenceFingerprint(evidencePath, fingerprint, nodeBuildFs)
    await fs.writeFile(evidencePath, "{ not valid json", "utf8")

    const result = await getEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot, location })

    expect(result.source).toBe("miss")
    expect(result.missReason).toContain("could not be parsed as JSON")
  })

  it("misses and recomputes when the committed artifact's schemaVersion is unrecognized", async () => {
    const fingerprint = await computeSourceFingerprint(fingerprintOptions)
    await fs.mkdir(path.dirname(evidencePath), { recursive: true })
    await writeEvidenceFingerprint(evidencePath, fingerprint, nodeBuildFs)
    await fs.writeFile(evidencePath, JSON.stringify({ schemaVersion: 999 }), "utf8")

    const result = await getEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot, location })

    expect(result.source).toBe("miss")
    expect(result.missReason).toContain("unrecognized schemaVersion")
  })

  it("never writes anything itself, even on a cache miss", async () => {
    await getEvidenceModel({ fs: nodeBuildFs, root: fixtureRoot, location })
    await expect(fs.access(evidencePath)).rejects.toThrow()
    await expect(fs.access(`${evidencePath}.fingerprint`)).rejects.toThrow()
  })
})
