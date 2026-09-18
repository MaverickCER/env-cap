import { nodeBuildFs } from "../support/build-filesystem.js"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  checkEnvArtifacts,
  normalizeEvidenceJsonForComparison,
} from "../../src/build/check-artifacts.js"
import { EnvProjectGenerationError } from "../../src/build/errors.js"
import { generateEnvArtifacts } from "../../src/build/generate-env-artifacts.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(here, "fixtures-check-artifacts")

async function write(relativePath: string, content: string): Promise<string> {
  const filePath = path.join(fixtureRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf8")
  return filePath
}

const SCHEMA_SOURCE = `import { createEnv, documentEnv } from "env-cap";

const schema = { STRIPE_KEY: {} };

export const paymentsEnv = createEnv(schema, { name: "payments" });

documentEnv(schema, {
  owner: "payments-team",
  variables: { STRIPE_KEY: { description: "Stripe secret key." } },
});
`

beforeEach(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
  await write("features/payments/env.schema.ts", SCHEMA_SOURCE)
  await write(
    "src/server.ts",
    `import { paymentsEnv } from "../features/payments/env.schema.js";\npaymentsEnv.STRIPE_KEY;`,
  )
})

afterEach(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
})

const baseOptions = {
  fs: nodeBuildFs,
  root: fixtureRoot,
  manifest: { location: "src/generated/env.manifest.ts" },
  docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example" } },
  usage: { report: { location: "docs/OWNERSHIP.md" } },
}

describe("checkEnvArtifacts", () => {
  it("reports ok:true / all findings ok on a clean, freshly-generated project, and never modifies any file", async () => {
    await generateEnvArtifacts(baseOptions)

    const manifestPath = path.resolve(fixtureRoot, "src/generated/env.manifest.ts")
    const docsPath = path.resolve(fixtureRoot, "docs/ENVIRONMENT.md")
    const envExamplePath = path.resolve(fixtureRoot, ".env.example")
    const ownershipPath = path.resolve(fixtureRoot, "docs/OWNERSHIP.md")

    const before = await Promise.all(
      [manifestPath, docsPath, envExamplePath, ownershipPath].map(async (p) => ({
        content: await fs.readFile(p, "utf8"),
        mtimeMs: (await fs.stat(p)).mtimeMs,
      })),
    )

    const result = await checkEnvArtifacts(baseOptions)

    expect(result.ok).toBe(true)
    expect(result.findings.every((f) => f.status === "ok")).toBe(true)
    expect(result.findings).toHaveLength(4)
    // Every artifact's own `artifact` label, not just an overall count --
    // proves the "usage" literal specifically (no existing test elsewhere
    // in this file names it).
    expect(result.findings.map((f) => f.artifact).sort()).toEqual([
      "docs",
      "envExample",
      "manifest",
      "usage",
    ])
    // exactOptionalPropertyTypes: `detail` must be genuinely ABSENT for an
    // "ok" finding, not present-but-undefined -- `"detail" in f` (not
    // `f.detail === undefined`, which `toEqual`/`objectContaining` would
    // treat as equivalent to absent anyway) is what actually distinguishes
    // the two.
    expect(result.findings.some((f) => "detail" in f)).toBe(false)

    const after = await Promise.all(
      [manifestPath, docsPath, envExamplePath, ownershipPath].map(async (p) => ({
        content: await fs.readFile(p, "utf8"),
        mtimeMs: (await fs.stat(p)).mtimeMs,
      })),
    )
    expect(after).toEqual(before)
  })

  it("reports the docs artifact as ok when it correctly lists an entirely UNDOCUMENTED contract and an undocumented variable -- both mappings must reproduce identically on re-check", async () => {
    // The baseline fixture's STRIPE_KEY is fully documented -- every other
    // test's `undocumentedContracts`/`undocumentedVariables` are empty
    // arrays, which a broken `.map()` callback can't be distinguished from
    // (mapping nothing produces `[]` either way). A contract with NO
    // documentEnv() call at all (undocumentedContracts) and a documented
    // contract with one undocumented variable (undocumentedVariables)
    // force a real re-check comparison of both mapped outputs.
    await write(
      "features/notifications/env.schema.ts",
      `import { createEnv, documentEnv } from "env-cap";
const schema = { SLACK_WEBHOOK: {} };
export const notificationsEnv = createEnv(schema, { name: "notifications" });
documentEnv(schema, { owner: "platform-team" });
`,
    )
    await write(
      "features/undocumented/env.schema.ts",
      `import { createEnv } from "env-cap";
const schema = { UNDOCUMENTED_VAR: {} };
export const undocumentedEnv = createEnv(schema, { name: "undocumented" });
`,
    )
    await generateEnvArtifacts(baseOptions)

    const result = await checkEnvArtifacts(baseOptions)
    const docsFinding = result.findings.find((f) => f.artifact === "docs")
    expect(docsFinding?.status).toBe("ok")
  })

  it("reports the docs artifact as ok on --check immediately after the project's very first-ever generation (no warm-up run needed)", async () => {
    // A true first-ever generateEnvArtifacts() call has no previousContent to
    // diff against, so renderDocs() must already render a self-consistent
    // "No changes." summary rather than omitting the section -- see
    // computeChangeSummary()'s docstring in docs.ts. Without that fix, a
    // single generation followed immediately by --check always reported docs
    // as stale, for a reason unrelated to any real drift.
    await generateEnvArtifacts(baseOptions)

    const result = await checkEnvArtifacts(baseOptions)
    const docsFinding = result.findings.find((f) => f.artifact === "docs")
    expect(docsFinding?.status).toBe("ok")
  })

  it("treats the docs artifact's generation-timestamp line as non-drift on an immediate re-check", async () => {
    await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      docs: { location: "docs/ENVIRONMENT.md" },
    })

    // Real time has moved forward since generation, so a naive byte-for-byte
    // comparison against a freshly-rendered "_Generated <now>_" line would
    // always report "stale" -- normalizeGeneratedLine() must prevent that.
    const result = await checkEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      docs: { location: "docs/ENVIRONMENT.md" },
    })

    const docsFinding = result.findings.find((f) => f.artifact === "docs")
    expect(docsFinding?.status).toBe("ok")
  })

  it("reports stale findings (without touching committed files) once the schema changes after generation", async () => {
    await generateEnvArtifacts(baseOptions)

    const manifestPath = path.resolve(fixtureRoot, "src/generated/env.manifest.ts")
    const docsPath = path.resolve(fixtureRoot, "docs/ENVIRONMENT.md")
    const beforeManifest = await fs.readFile(manifestPath, "utf8")
    const beforeDocs = await fs.readFile(docsPath, "utf8")

    // Add a whole new contract -- manifest.ts's output is a list of imported
    // contracts (agnostic to what's *inside* an existing one), so a new
    // variable on the existing "payments" contract alone wouldn't move it;
    // a new discovered contract changes both the manifest and docs output.
    await write(
      "features/notifications/env.schema.ts",
      `import { createEnv, documentEnv } from "env-cap";

const schema = { SLACK_WEBHOOK: {} };

export const notificationsEnv = createEnv(schema, { name: "notifications" });

documentEnv(schema, {
  owner: "platform-team",
  variables: { SLACK_WEBHOOK: { description: "Slack incoming webhook URL." } },
});
`,
    )

    const result = await checkEnvArtifacts(baseOptions)

    expect(result.ok).toBe(false)
    const byArtifact = new Map(result.findings.map((f) => [f.artifact, f]))
    expect(byArtifact.get("manifest")?.status).toBe("stale")
    expect(byArtifact.get("manifest")?.detail).toBe(
      "generated content differs from what's committed",
    )
    expect(byArtifact.get("docs")?.status).toBe("stale")

    // Committed files must be untouched by --check, even when drift is found.
    expect(await fs.readFile(manifestPath, "utf8")).toBe(beforeManifest)
    expect(await fs.readFile(docsPath, "utf8")).toBe(beforeDocs)
  })

  describe("normalizeEvidenceJsonForComparison (direct)", () => {
    it("returns malformed text UNCHANGED (not undefined, not thrown) when it isn't valid JSON", () => {
      const malformed = "{ not valid json"
      expect(normalizeEvidenceJsonForComparison(malformed)).toBe(malformed)
    })
  })

  describe("evidence artifact (--evidence)", () => {
    const evidenceOptions = { ...baseOptions, evidence: { location: "docs/env.evidence.json" } }

    it("reports the evidence artifact as ok on a clean, freshly-generated project", async () => {
      await generateEnvArtifacts(evidenceOptions)
      const result = await checkEnvArtifacts(evidenceOptions)
      const evidenceFinding = result.findings.find((f) => f.artifact === "evidence")
      expect(evidenceFinding?.status).toBe("ok")
    })

    it("reports the evidence artifact as stale once the schema changes -- content comparison is real, not vacuously always-ok", async () => {
      await generateEnvArtifacts(evidenceOptions)
      await write(
        "features/notifications/env.schema.ts",
        `import { createEnv, documentEnv } from "env-cap";

const schema = { SLACK_WEBHOOK: {} };

export const notificationsEnv = createEnv(schema, { name: "notifications" });

documentEnv(schema, {
  owner: "platform-team",
  variables: { SLACK_WEBHOOK: { description: "Slack incoming webhook URL." } },
});
`,
      )
      const result = await checkEnvArtifacts(evidenceOptions)
      const evidenceFinding = result.findings.find((f) => f.artifact === "evidence")
      expect(evidenceFinding?.status).toBe("stale")
    })

    it("reports the evidence artifact as stale, without crashing, when the committed file isn't valid JSON", async () => {
      await generateEnvArtifacts(evidenceOptions)
      await write("docs/env.evidence.json", "{ not valid json")
      const result = await checkEnvArtifacts(evidenceOptions)
      const evidenceFinding = result.findings.find((f) => f.artifact === "evidence")
      expect(evidenceFinding?.status).toBe("stale")
    })
  })

  it("reports missing findings, and creates nothing, when the target artifacts don't exist yet", async () => {
    const manifestPath = path.resolve(fixtureRoot, "src/generated/env.manifest.ts")
    const docsPath = path.resolve(fixtureRoot, "docs/ENVIRONMENT.md")

    const result = await checkEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      manifest: { location: "src/generated/env.manifest.ts" },
      docs: { location: "docs/ENVIRONMENT.md" },
    })

    expect(result.ok).toBe(false)
    expect(result.findings.every((f) => f.status === "missing")).toBe(true)
    expect(result.findings.every((f) => f.detail === "not yet generated")).toBe(true)

    await expect(fs.access(manifestPath)).rejects.toThrow()
    await expect(fs.access(docsPath)).rejects.toThrow()
  })

  it("result.ok is false when only SOME findings are ok (mixed), not just when ALL are -- distinguishes .every() from .some()", async () => {
    // Only the manifest pass has ever run -- its own finding is genuinely
    // "ok", while docs (requested here for the first time) is "missing".
    // `.some((f) => f.status === "ok")` would wrongly report `ok: true`
    // here (the manifest finding alone satisfies it); only `.every()` is
    // correct.
    await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      manifest: { location: "src/generated/env.manifest.ts" },
    })

    const result = await checkEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      manifest: { location: "src/generated/env.manifest.ts" },
      docs: { location: "docs/ENVIRONMENT.md" },
    })

    expect(result.ok).toBe(false)
    const byArtifact = new Map(result.findings.map((f) => [f.artifact, f.status]))
    expect(byArtifact.get("manifest")).toBe("ok")
    expect(byArtifact.get("docs")).toBe("missing")
  })

  it("treats an already-reconciled .env.example with an added, unrelated human comment as ok (uses reconciliation, not raw string equality)", async () => {
    await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example" } },
    })

    const envExamplePath = path.resolve(fixtureRoot, ".env.example")
    const existing = await fs.readFile(envExamplePath, "utf8")
    await fs.writeFile(
      envExamplePath,
      `${existing}\n# Note: reviewed by security on 2026-01-01\n`,
      "utf8",
    )

    const result = await checkEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example" } },
    })

    const envExampleFinding = result.findings.find((f) => f.artifact === "envExample")
    expect(envExampleFinding?.status).toBe("ok")
  })

  it("reports the envExample artifact as stale, with the exact drift-count detail, when it's out of sync", async () => {
    // A "legacy" contract, ACTIVE for this first generation, so
    // LEGACY_VAR ends up genuinely live (uncommented) in the committed
    // .env.example.
    await write(
      "features/legacy/env.schema.ts",
      `import { createEnv, documentEnv } from "env-cap";
const legacySchema = { LEGACY_VAR: {} };
export const legacyEnv = createEnv(legacySchema, { name: "legacy" });
documentEnv(legacySchema, { owner: "legacy-team" });
`,
    )
    await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example" } },
    })

    // Three independent, distinct-count drift categories in one check, so
    // no single arithmetic operator swap in the 3-term sum can hide behind
    // a same-value coincidence: a new required variable (STRIPE_WEBHOOK_
    // SECRET) -> variablesToAdd; "legacy" now deactivated, so LEGACY_VAR is
    // still live in .env.example but no active contract needs it anymore
    // -> variablesToComment; a stale entry (RETIRED_VAR) the schema no
    // longer declares at all -> staleVariables.
    await write(
      "features/payments/env.schema.ts",
      `import { createEnv, documentEnv } from "env-cap";

const schema = { STRIPE_KEY: {}, STRIPE_WEBHOOK_SECRET: {} };

export const paymentsEnv = createEnv(schema, { name: "payments" });

documentEnv(schema, {
  owner: "payments-team",
  variables: {
    STRIPE_KEY: { description: "Stripe secret key." },
    STRIPE_WEBHOOK_SECRET: { description: "Stripe webhook signing secret." },
  },
});
`,
    )
    await write(
      "features/legacy/env.schema.ts",
      `import { createEnv, documentEnv } from "env-cap";
const legacySchema = { LEGACY_VAR: {} };
export const legacyEnv = createEnv(legacySchema, { name: "legacy" });
documentEnv(legacySchema, { owner: "legacy-team", active: false });
`,
    )
    const envExamplePath = path.resolve(fixtureRoot, ".env.example")
    const existing = await fs.readFile(envExamplePath, "utf8")
    await fs.writeFile(envExamplePath, `${existing}\nRETIRED_VAR=\n`, "utf8")

    const result = await checkEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example" } },
    })

    const envExampleFinding = result.findings.find((f) => f.artifact === "envExample")
    expect(envExampleFinding?.status).toBe("stale")
    expect(envExampleFinding?.detail).toBe("1 stale, 1 to comment, 1 to add")
  })

  it("reports drift from `variablesToAdd` alone (0 stale, 0 to comment) -- isolates one term of driftCount's 3-way sum", async () => {
    await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example" } },
    })

    await write(
      "features/payments/env.schema.ts",
      `import { createEnv, documentEnv } from "env-cap";

const schema = { STRIPE_KEY: {}, STRIPE_WEBHOOK_SECRET: {} };

export const paymentsEnv = createEnv(schema, { name: "payments" });

documentEnv(schema, {
  owner: "payments-team",
  variables: {
    STRIPE_KEY: { description: "Stripe secret key." },
    STRIPE_WEBHOOK_SECRET: { description: "Stripe webhook signing secret." },
  },
});
`,
    )

    const result = await checkEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example" } },
    })

    const envExampleFinding = result.findings.find((f) => f.artifact === "envExample")
    expect(envExampleFinding?.status).toBe("stale")
    expect(envExampleFinding?.detail).toBe("0 stale, 0 to comment, 1 to add")
  })

  it("reports drift from `variablesToComment` alone (0 stale, 0 to add) -- isolates a different term of driftCount's 3-way sum", async () => {
    await generateEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example" } },
    })

    // "payments" deactivated -- STRIPE_KEY is still live in the committed
    // .env.example, but no active contract needs it anymore.
    await write(
      "features/payments/env.schema.ts",
      `import { createEnv, documentEnv } from "env-cap";
const schema = { STRIPE_KEY: {} };
export const paymentsEnv = createEnv(schema, { name: "payments" });
documentEnv(schema, { owner: "payments-team", active: false });
`,
    )

    const result = await checkEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example" } },
    })

    const envExampleFinding = result.findings.find((f) => f.artifact === "envExample")
    expect(envExampleFinding?.status).toBe("stale")
    expect(envExampleFinding?.detail).toBe("0 stale, 1 to comment, 0 to add")
  })

  it("still rejects a --location that escapes root, same as a real run", async () => {
    await expect(
      checkEnvArtifacts({
        fs: nodeBuildFs,
        root: fixtureRoot,
        manifest: { location: "../outside.ts" },
      }),
    ).rejects.toThrow(EnvProjectGenerationError)
  })

  it("throws on a blocking finding (a manifest exclusive-group violation, ADR 0009), distinct from the path-escape throw above", async () => {
    // The path-escape test above throws from inside computeArtifacts() before
    // checkEnvArtifacts ever inspects `c.blocking` -- this is the only case
    // that reaches checkEnvArtifacts's own `if (c.blocking.length > 0) throw`.
    // Docs/ownership never contribute to `blocking` at all (ADR 0038) -- the
    // manifest pass's provable exclusive-group/compatibility errors are the
    // only remaining source.
    await write(
      "features/db-a/env.schema.ts",
      `import { createEnv, documentEnv } from "env-cap";
const schema = { DATABASE_URL: {} };
export const dbAEnv = createEnv(schema, { name: "db-a" });
documentEnv(schema, { exclusiveGroup: "database", active: true });
`,
    )
    await write(
      "features/db-b/env.schema.ts",
      `import { createEnv, documentEnv } from "env-cap";
const schema = { DATABASE_URL: {} };
export const dbBEnv = createEnv(schema, { name: "db-b" });
documentEnv(schema, { exclusiveGroup: "database", active: true });
`,
    )

    await expect(
      checkEnvArtifacts({
        fs: nodeBuildFs,
        root: fixtureRoot,
        manifest: { location: "src/generated/exclusive.manifest.ts" },
      }),
    ).rejects.toThrow(EnvProjectGenerationError)
  })

  it("reports the envExample artifact as missing when docs+envExample are requested but no .env.example exists yet", async () => {
    const result = await checkEnvArtifacts({
      fs: nodeBuildFs,
      root: fixtureRoot,
      docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example" } },
    })

    const envExampleFinding = result.findings.find((f) => f.artifact === "envExample")
    expect(envExampleFinding).toEqual({
      artifact: "envExample",
      path: path.resolve(fixtureRoot, ".env.example"),
      status: "missing",
      detail: "not yet generated",
    })
    await expect(fs.access(path.resolve(fixtureRoot, ".env.example"))).rejects.toThrow()
  })
})
