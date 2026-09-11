import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { EvidenceModel } from "../../src/build/evidence-model.js"
import type { GenerateEnvArtifactsResult } from "../../src/build/generate-env-artifacts.js"
import { EnvProjectGenerationError } from "../../src/build/errors.js"
import { JSON_SCHEMA_VERSION, serializeFailure, serializeSuccess } from "../../src/cli/json.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const packageJsonPath = path.resolve(here, "../../package.json")
const realVersion = (JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version: string })
  .version

/** Minimal, structurally-valid `EvidenceModel` -- every sub-model empty. Real content isn't the point of these envelope-shape tests. */
const EMPTY_EVIDENCE: EvidenceModel = {
  schemaVersion: 1,
  provenance: { generatedAt: "2026-01-01T00:00:00.000Z", toolVersion: "0.0.0", commit: undefined },
  contract: { schemaVersion: 3, contracts: [] },
  dependency: { schemaVersion: 2, contracts: [], consumers: [], warnings: [], scannedSurfaces: [] },
  ownership: { schemaVersion: 1, contracts: [], unownedContracts: [], unownedVariables: [] },
  lifecycle: { schemaVersion: 2, contracts: [], expiring: [] },
  finding: { schemaVersion: 3, findings: [] },
  change: {
    schemaVersion: 1,
    manifest: {
      addedContracts: [],
      removedContracts: [],
      addedVariables: [],
      removedVariables: [],
      updatedContracts: [],
      updatedVariables: [],
    },
    renamedVariables: [],
  },
}

const FULL_RESULT: GenerateEnvArtifactsResult = {
  manifest: {
    outputPath: "/repo/src/generated/env.manifest.ts",
    contracts: [
      {
        file: "features/payments/env.schema.ts",
        exportName: "paymentsEnv",
        contractName: "payments",
        variableCount: 1,
        active: true,
        documented: true,
      },
    ],
    warnings: [],
    parseWarnings: [],
  },
  docs: {
    docsPath: "/repo/docs/ENVIRONMENT.md",
    envExample: undefined,
    contracts: [
      {
        file: "features/payments/env.schema.ts",
        exportName: "paymentsEnv",
        contractName: "payments",
        variableCount: 1,
        active: true,
        documented: true,
      },
    ],
    catalog: [
      {
        file: "/repo/features/payments/env.schema.ts",
        exportName: "paymentsEnv",
        contractName: "payments",
        active: true,
        documented: true,
        category: "Payments",
        exclusiveGroup: undefined,
        owner: "payments-team",
        sensitivity: undefined,
        expiresAt: undefined,
        purpose: undefined,
        legalBasis: undefined,
        retention: undefined,
        dataResidency: undefined,
        auditRequired: undefined,
        metadata: { service: "Payment Processing API", criticality: "Production-critical" },
        variables: {
          STRIPE_KEY: {
            description: "Stripe secret API key.",
            owner: "sysadmin@example.com",
            sensitivity: "secret",
            expiresAt: "2027-01-01",
            refreshInstructions: "Rotate the key in the Stripe Dashboard.",
            setupInstructions: undefined,
            required: true,
            hasDefault: false,
            hasProcessor: false,
            processorReturnType: undefined,
            hasValidator: true,
            documented: true,
            context: undefined,
            purpose: undefined,
            legalBasis: undefined,
            retention: undefined,
            dataResidency: undefined,
            auditRequired: undefined,
            metadata: {
              rotationCadence: "90 days",
              storageProvider: "AWS Secrets Manager",
              compliance: "PCI DSS",
            },
            evidence: undefined,
          },
        },
      },
    ],
    parseWarnings: [],
    documentation: {
      undocumentedContracts: [],
      undocumentedVariables: [],
      staleDocEntries: [],
      expiringSoon: [],
      nonstandardSensitivityLevels: [],
      unresolvedLinks: [],
    },
  },
  usage: {
    reportPath: "/repo/docs/OWNERSHIP.md",
    dependencyOwnership: [
      {
        contractName: "payments",
        file: "features/payments/env.schema.ts",
        owner: "payments-team",
        variableCount: 1,
        consumers: ["src/app.ts"],
      },
    ],
    abandonedContracts: [],
    unresolvedConsumers: [],
    unconsumedOwnedVariables: [],
    indeterminate: [],
    asserted: [],
    parseWarnings: [],
    scannedSurfaces: [{ label: "application", root: "." }],
  },
  evidence: EMPTY_EVIDENCE,
}

const MINIMAL_RESULT: GenerateEnvArtifactsResult = {
  manifest: undefined,
  docs: undefined,
  usage: undefined,
  evidence: EMPTY_EVIDENCE,
}

describe("serializeSuccess", () => {
  it("wraps the result in a stable envelope", () => {
    const payload = serializeSuccess(MINIMAL_RESULT)
    expect(payload.schemaVersion).toBe(JSON_SCHEMA_VERSION)
    expect(payload.kind).toBe("env-cap-report")
    expect(payload.toolVersion).toBe(realVersion)
    expect(payload.ok).toBe(true)
    expect(payload.manifest).toBeUndefined()
    expect(payload.docs).toBeUndefined()
    expect(payload.usage).toBeUndefined()
  })

  it("omits evidence by default, even when result.evidence is populated (it always is -- ADR 0038)", () => {
    const payload = serializeSuccess(FULL_RESULT)
    expect(payload.evidence).toBeUndefined()
    expect("evidence" in payload).toBe(false)
  })

  it("includes evidence only when includeEvidence is passed true", () => {
    const payload = serializeSuccess(FULL_RESULT, undefined, true)
    expect(payload.evidence).toEqual(EMPTY_EVIDENCE)
  })

  it("passes the full result through untouched, alongside the envelope fields", () => {
    const payload = serializeSuccess(FULL_RESULT)
    expect(payload.manifest).toEqual(FULL_RESULT.manifest)
    expect(payload.docs).toEqual(FULL_RESULT.docs)
    expect(payload.usage).toEqual(FULL_RESULT.usage)
  })

  it("matches the documented success shape (snapshot)", () => {
    expect(serializeSuccess(FULL_RESULT)).toMatchSnapshot()
  })

  it("omits checkResult when not passed (existing call sites are unaffected)", () => {
    const payload = serializeSuccess(MINIMAL_RESULT)
    expect(payload.checkResult).toBeUndefined()
    expect("checkResult" in payload).toBe(false)
  })

  it("includes an additive checkResult field when --check finds stale artifacts (snapshot)", () => {
    expect(serializeSuccess(MINIMAL_RESULT, { ok: false, stale: ["docs"] })).toMatchSnapshot()
  })
})

describe("serializeFailure", () => {
  it("populates error.issues from a real EnvProjectGenerationError", () => {
    const error = new EnvProjectGenerationError([
      {
        severity: "error",
        variable: 'Exclusive group "database"',
        files: ["features/db-a/env.schema.ts", "features/db-b/env.schema.ts"],
        reason: "Two active contracts share this exclusive group.",
      },
    ])
    const payload = serializeFailure(error)
    expect(payload.ok).toBe(false)
    expect(payload.error.name).toBe("EnvProjectGenerationError")
    expect(payload.error.issues).toEqual(error.issues)
  })

  it("leaves error.issues undefined for a plain Error", () => {
    const payload = serializeFailure(new Error("something else broke"))
    expect(payload.ok).toBe(false)
    expect(payload.error.name).toBe("Error")
    expect(payload.error.message).toBe("something else broke")
    expect(payload.error.issues).toBeUndefined()
  })

  it("handles a thrown non-Error value without crashing", () => {
    const payload = serializeFailure("a thrown string")
    expect(payload.error.name).toBe("Error")
    expect(payload.error.message).toBe("a thrown string")
    expect(payload.error.issues).toBeUndefined()
  })

  it("handles a thrown null without crashing -- typeof null === 'object', but it must not be read as one", () => {
    const payload = serializeFailure(null)
    expect(payload.error.issues).toBeUndefined()
  })

  it("never treats a non-object value as carrying .issues, even one with an .issues array attached", () => {
    // Functions can carry arbitrary own properties -- this is the one
    // realistic way to construct a genuinely non-"object"-typed value
    // (`typeof fn === "function"`) that still has an `.issues` array, to
    // isolate the `typeof error === "object"` check from the
    // `Array.isArray` one.
    const fn = (): void => {
      /* never called -- only its own .issues property matters here */
    }
    Object.assign(fn, { issues: ["not really an issue"] })
    const payload = serializeFailure(fn)
    expect(payload.error.issues).toBeUndefined()
  })

  it("never populates .issues from a non-array .issues property", () => {
    const payload = serializeFailure({ issues: "not an array" })
    expect(payload.error.issues).toBeUndefined()
  })

  it("carries schemaVersion/kind/toolVersion even on failure", () => {
    const payload = serializeFailure(new Error("x"))
    expect(payload.schemaVersion).toBe(JSON_SCHEMA_VERSION)
    expect(payload.kind).toBe("env-cap-report")
    expect(payload.toolVersion).toBe(realVersion)
  })

  it("matches the documented failure shape (snapshot)", () => {
    const error = new EnvProjectGenerationError([
      {
        severity: "error",
        variable: 'Exclusive group "database"',
        files: ["features/db-a/env.schema.ts", "features/db-b/env.schema.ts"],
        reason: "Two active contracts share this exclusive group.",
      },
    ])
    expect(serializeFailure(error)).toMatchSnapshot()
  })
})

describe("serializeSuccess -- requested", () => {
  it("always records which passes were requested, so absent is never confused with empty", () => {
    const payload = serializeSuccess(
      { manifest: undefined, docs: undefined, usage: undefined },
      undefined,
      false,
      { manifest: true, docs: true, usage: false, evidence: false },
    )
    // Every result is absent, yet two passes were genuinely requested -- the
    // exact case that was previously indistinguishable from "not requested."
    expect(payload.requested).toEqual({
      manifest: true,
      docs: true,
      usage: false,
      evidence: false,
    })
    expect(payload.manifest).toBeUndefined()
    expect(payload.docs).toBeUndefined()
  })

  it("falls back to deriving each pass from its own result when no flags are supplied", () => {
    const payload = serializeSuccess(FULL_RESULT)
    expect(payload.requested).toEqual({
      manifest: true,
      docs: true,
      usage: true,
      // Derived from includeEvidence, which defaults to false.
      evidence: false,
    })
  })

  it("reports evidence as requested exactly when the evidence model is included", () => {
    expect(serializeSuccess(FULL_RESULT, undefined, true).requested.evidence).toBe(true)
    expect(serializeSuccess(FULL_RESULT, undefined, false).requested.evidence).toBe(false)
  })

  it("keeps requested independent of checkResult -- a --check run still reports its passes", () => {
    const payload = serializeSuccess(
      { manifest: undefined, docs: undefined, usage: undefined },
      { ok: false, stale: ["docs"] },
      false,
      { manifest: false, docs: true, usage: false, evidence: false },
    )
    expect(payload.requested.docs).toBe(true)
    expect(payload.checkResult).toEqual({ ok: false, stale: ["docs"] })
  })
})
