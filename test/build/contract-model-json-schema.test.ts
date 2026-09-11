import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Ajv from "ajv"
import { describe, expect, it } from "vitest"
import { generateContractModelSchema } from "../../scripts/generate-json-schema.mjs"
import { buildContractModel } from "../../src/build/contract-model.js"
import type { DiscoveredContract } from "../../src/build/link.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, "../..")
const schemaPath = path.resolve(projectRoot, "schemas/contract-model.schema.json")

describe("published Contract Model JSON Schema: freshness", () => {
  // Same reasoning as test/build/json-schema.test.ts's freshness test: a real
  // TypeScript program/type-check over the whole type graph, slow enough
  // under coverage instrumentation to need a longer timeout.
  it("matches a fresh generation byte-for-byte (fails if committed but stale)", () => {
    const fresh = `${JSON.stringify(generateContractModelSchema(), null, 2)}\n`
    const committed = readFileSync(schemaPath, "utf8")
    expect(committed).toBe(fresh)
  }, 15000)
})

describe("published Contract Model JSON Schema: correctness", () => {
  const ajv = new Ajv({ strict: false })
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object
  const validate = ajv.compile(schema)

  it("a real ContractModel built from DiscoveredContract data validates against the schema", () => {
    const contract: DiscoveredContract = {
      file: "/repo/payments/env.schema.ts",
      exportName: "paymentsEnv",
      contractName: "payments",
      active: true,
      category: "payments",
      exclusiveGroup: undefined,
      owner: "payments-team",
      sensitivity: "credential",
      expiresAt: undefined,
      deprecated: undefined,
      deprecatedReason: undefined,
      purpose: "Process customer payments.",
      legalBasis: "Contractual necessity.",
      retention: "Delete after 90 days.",
      dataResidency: ["EU", "US"],
      auditRequired: true,
      metadata: { runbook: "https://wiki.internal/payments" },
      documented: true,
      packageOrigin: undefined,
      declaration: { file: "/repo/payments/env.schema.ts", line: 1, column: 1 },
      documentation: { file: "/repo/payments/env.schema.ts", line: 10, column: 1 },
      variables: [
        {
          key: "STRIPE_KEY",
          declaration: { file: "/repo/payments/env.schema.ts", line: 2, column: 3 },
          hasDefault: false,
          defaultValue: undefined,
          hasProcessor: true,
          processorSource: "(v) => String(v)",
          processorReturnType: "string",
          hasValidator: false,
          validatorSource: undefined,
          context: undefined,
          description: "Stripe secret key.",
          owner: undefined,
          sensitivity: "secret",
          expiresAt: "2026-09-01",
          refreshInstructions: "Rotate in the Stripe dashboard.",
          setupInstructions: undefined,
          required: true,
          deprecated: undefined,
          deprecatedReason: undefined,
          removeBy: undefined,
          renamedFrom: undefined,
          purpose: undefined,
          legalBasis: undefined,
          retention: undefined,
          dataResidency: "EU",
          auditRequired: true,
          metadata: { rotationCadence: "90 days" },
          evidence: undefined,
          documented: true,
        },
      ],
    }

    const model = buildContractModel([contract], "/repo")
    expect(validate(model)).toBe(true)
    if (!validate(model)) console.error(validate.errors)
  })
})
