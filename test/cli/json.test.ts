import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { GenerateEnvArtifactsResult } from "../../src/build/generate-env-artifacts.js"
import { EnvProjectGenerationError } from "../../src/build/errors.js"
import { JSON_SCHEMA_VERSION, serializeFailure, serializeSuccess } from "../../src/cli/json.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const packageJsonPath = path.resolve(here, "../../package.json")
const realVersion = (JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version: string })
  .version

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
    changes: {
      addedContracts: [],
      removedContracts: [],
      addedVariables: [],
      removedVariables: [],
      updatedContracts: [],
      updatedVariables: [],
    },
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
        expiresAt: undefined,
        metadata: { service: "Payment Processing API", criticality: "Production-critical" },
        variables: {
          STRIPE_KEY: {
            description: "Stripe secret API key.",
            owner: "sysadmin@example.com",
            expiresAt: "2027-01-01",
            refreshInstructions: "Rotate the key in the Stripe Dashboard.",
            required: true,
            hasDefault: false,
            hasProcessor: false,
            processorReturnType: undefined,
            hasValidator: true,
            documented: true,
            context: undefined,
            extra: {
              rotationCadence: "90 days",
              storageProvider: "AWS Secrets Manager",
              compliance: "PCI DSS",
            },
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
    parseWarnings: [],
  },
}

const MINIMAL_RESULT: GenerateEnvArtifactsResult = {
  manifest: undefined,
  docs: undefined,
  usage: undefined,
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
