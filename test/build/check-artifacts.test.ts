import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { checkEnvArtifacts } from "../../src/build/check-artifacts.js"
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

const SCHEMA_SOURCE = `import { createEnv, documentEnv } from "@maverickcer/env-cap";

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

    const after = await Promise.all(
      [manifestPath, docsPath, envExamplePath, ownershipPath].map(async (p) => ({
        content: await fs.readFile(p, "utf8"),
        mtimeMs: (await fs.stat(p)).mtimeMs,
      })),
    )
    expect(after).toEqual(before)
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
    await generateEnvArtifacts({ root: fixtureRoot, docs: { location: "docs/ENVIRONMENT.md" } })

    // Real time has moved forward since generation, so a naive byte-for-byte
    // comparison against a freshly-rendered "_Generated <now>_" line would
    // always report "stale" -- normalizeGeneratedLine() must prevent that.
    const result = await checkEnvArtifacts({
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
      `import { createEnv, documentEnv } from "@maverickcer/env-cap";

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
    expect(byArtifact.get("docs")?.status).toBe("stale")

    // Committed files must be untouched by --check, even when drift is found.
    expect(await fs.readFile(manifestPath, "utf8")).toBe(beforeManifest)
    expect(await fs.readFile(docsPath, "utf8")).toBe(beforeDocs)
  })

  it("reports missing findings, and creates nothing, when the target artifacts don't exist yet", async () => {
    const manifestPath = path.resolve(fixtureRoot, "src/generated/env.manifest.ts")
    const docsPath = path.resolve(fixtureRoot, "docs/ENVIRONMENT.md")

    const result = await checkEnvArtifacts({
      root: fixtureRoot,
      manifest: { location: "src/generated/env.manifest.ts" },
      docs: { location: "docs/ENVIRONMENT.md" },
    })

    expect(result.ok).toBe(false)
    expect(result.findings.every((f) => f.status === "missing")).toBe(true)

    await expect(fs.access(manifestPath)).rejects.toThrow()
    await expect(fs.access(docsPath)).rejects.toThrow()
  })

  it("treats an already-reconciled .env.example with an added, unrelated human comment as ok (uses reconciliation, not raw string equality)", async () => {
    await generateEnvArtifacts({
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
      root: fixtureRoot,
      docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example" } },
    })

    const envExampleFinding = result.findings.find((f) => f.artifact === "envExample")
    expect(envExampleFinding?.status).toBe("ok")
  })

  it("still rejects a --location that escapes root, same as a real run", async () => {
    await expect(
      checkEnvArtifacts({ root: fixtureRoot, manifest: { location: "../outside.ts" } }),
    ).rejects.toThrow(EnvProjectGenerationError)
  })

  it("throws on a blocking finding (e.g. an undocumented contract escalated via onUndocumented: throw), distinct from the path-escape throw above", async () => {
    // The path-escape test above throws from inside computeArtifacts() before
    // checkEnvArtifacts ever inspects `c.blocking` -- this is the only case
    // that reaches checkEnvArtifacts's own `if (c.blocking.length > 0) throw`.
    await write(
      "features/undocumented/env.schema.ts",
      `import { createEnv } from "@maverickcer/env-cap";
export const undocumentedEnv = createEnv({ SOME_KEY: {} }, { name: "undocumented" });
`,
    )

    await expect(
      checkEnvArtifacts({
        root: fixtureRoot,
        docs: { location: "docs/ENVIRONMENT.md", onUndocumented: "throw" },
      }),
    ).rejects.toThrow(EnvProjectGenerationError)
  })

  it("reports the envExample artifact as missing when docs+envExample are requested but no .env.example exists yet", async () => {
    const result = await checkEnvArtifacts({
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
