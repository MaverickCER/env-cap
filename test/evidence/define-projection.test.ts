import { describe, expect, it } from "vitest"
import type { EvidenceModel } from "../../src/build/evidence-model.js"
import { defineEvidenceProjection } from "../../src/evidence/define-projection.js"

function makeEvidenceModel(): EvidenceModel {
  return {
    schemaVersion: 1,
    provenance: {
      generatedAt: "2026-01-01T00:00:00.000Z",
      toolVersion: "0.1.0",
      commit: "abc123",
    },
    contract: {
      schemaVersion: 1,
      contracts: [
        {
          file: "/repo/src/payments/env.schema.ts",
          exportName: "paymentsEnv",
          contractName: "payments",
          active: true,
          category: undefined,
          exclusiveGroup: undefined,
          owner: "payments-team",
          classification: undefined,
          expiresAt: undefined,
          metadata: undefined,
          documented: true,
          packageOrigin: undefined,
          variables: [
            {
              key: "STRIPE_KEY",
              hasDefault: false,
              defaultValue: undefined,
              hasProcessor: false,
              processorSource: undefined,
              processorReturnType: undefined,
              hasValidator: false,
              validatorSource: undefined,
              context: undefined,
              description: "Stripe secret key",
              owner: undefined,
              classification: "secret",
              expiresAt: undefined,
              refreshInstructions: undefined,
              required: true,
              extra: {},
              documented: true,
            },
            {
              key: "STRIPE_WEBHOOK_SECRET",
              hasDefault: false,
              defaultValue: undefined,
              hasProcessor: false,
              processorSource: undefined,
              processorReturnType: undefined,
              hasValidator: false,
              validatorSource: undefined,
              context: undefined,
              description: undefined,
              owner: undefined,
              classification: undefined,
              expiresAt: undefined,
              refreshInstructions: undefined,
              required: true,
              extra: {},
              documented: false,
            },
          ],
        },
      ],
    },
    dependency: {
      schemaVersion: 1,
      contracts: [
        {
          file: "/repo/src/payments/env.schema.ts",
          exportName: "paymentsEnv",
          contractName: "payments",
          imported: true,
          hasDynamicAccess: false,
          variables: [
            { key: "STRIPE_KEY", status: "used", lines: [12] },
            { key: "STRIPE_WEBHOOK_SECRET", status: "unconsumed", lines: [] },
          ],
          consumingFiles: ["/repo/src/payments/charge.ts"],
          ambiguousBarrelFiles: [],
        },
      ],
      consumers: [
        {
          file: "/repo/src/payments/charge.ts",
          contracts: [
            {
              file: "/repo/src/payments/env.schema.ts",
              exportName: "paymentsEnv",
              contractName: "payments",
            },
          ],
        },
      ],
      warnings: [],
    },
    ownership: {
      schemaVersion: 1,
      contracts: [
        {
          file: "/repo/src/payments/env.schema.ts",
          exportName: "paymentsEnv",
          contractName: "payments",
          owner: "payments-team",
          variables: [
            { key: "STRIPE_KEY", owner: "payments-team" },
            { key: "STRIPE_WEBHOOK_SECRET", owner: "payments-team" },
          ],
        },
      ],
      unownedContracts: [],
      unownedVariables: [],
    },
    lifecycle: {
      schemaVersion: 1,
      contracts: [],
      expiring: [],
    },
    finding: {
      schemaVersion: 1,
      findings: [
        {
          severity: "warning",
          code: "undocumented-variable",
          family: "documentation",
          message: "STRIPE_WEBHOOK_SECRET is undocumented",
          location: {
            model: "contract",
            file: "/repo/src/payments/env.schema.ts",
            exportName: "paymentsEnv",
            variable: "STRIPE_WEBHOOK_SECRET",
          },
        },
      ],
    },
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
}

describe("defineEvidenceProjection", () => {
  it("computes each output field from its own projector function", () => {
    const projection = defineEvidenceProjection({
      contractCount: (evidence) => evidence.contract.contracts.length,
      findingCount: (evidence) => evidence.finding.findings.length,
    })
    const evidence = makeEvidenceModel()
    expect(projection(evidence)).toEqual({ contractCount: 1, findingCount: 1 })
  })

  it("project() returns the same value as calling the projection directly", () => {
    const projection = defineEvidenceProjection({
      owner: (evidence) => evidence.ownership.contracts[0]?.owner,
    })
    const evidence = makeEvidenceModel()
    expect(projection.project(evidence).value).toEqual(projection(evidence))
  })

  it("records which EvidenceModel field paths each output field read", () => {
    const projection = defineEvidenceProjection({
      firstContractName: (evidence) => evidence.contract.contracts[0]?.contractName,
      findingCount: (evidence) => evidence.finding.findings.length,
    })
    const { sources } = projection.project(makeEvidenceModel())
    expect(sources.firstContractName).toEqual([
      "contract",
      "contract.contracts",
      "contract.contracts.0",
      "contract.contracts.0.contractName",
    ])
    expect(sources.findingCount).toEqual(["finding", "finding.findings"])
  })

  it("dedupes repeated reads of the same field path within one projector", () => {
    const projection = defineEvidenceProjection({
      // Reads evidence.contract twice -- should only be recorded once.
      value: (evidence) => evidence.contract.schemaVersion + evidence.contract.contracts.length,
    })
    const { sources } = projection.project(makeEvidenceModel())
    expect(sources.value.filter((path) => path === "contract")).toHaveLength(1)
  })

  it("returns the same proxy instance for repeated reads of the same nested object", () => {
    const projection = defineEvidenceProjection({
      identical: (evidence) => evidence.contract === evidence.contract,
    })
    expect(projection(makeEvidenceModel())).toEqual({ identical: true })
  })

  it("correctly attributes reads through array iteration (.map())", () => {
    const projection = defineEvidenceProjection({
      keys: (evidence) => evidence.contract.contracts[0]?.variables.map((v) => v.key),
    })
    const { value, sources } = projection.project(makeEvidenceModel())
    expect(value.keys).toEqual(["STRIPE_KEY", "STRIPE_WEBHOOK_SECRET"])
    expect(sources.keys).toContain("contract.contracts.0.variables.0.key")
    expect(sources.keys).toContain("contract.contracts.0.variables.1.key")
    // .length reads (internal to iteration) are deliberately not recorded as sources.
    expect(sources.keys.some((path) => path.endsWith(".length"))).toBe(false)
  })

  it("correctly attributes reads through for...of iteration", () => {
    const projection = defineEvidenceProjection({
      names: (evidence) => {
        const names: string[] = []
        for (const contract of evidence.contract.contracts) names.push(contract.contractName)
        return names
      },
    })
    const { value, sources } = projection.project(makeEvidenceModel())
    expect(value.names).toEqual(["payments"])
    expect(sources.names).toContain("contract.contracts")
    expect(sources.names).toContain("contract.contracts.0.contractName")
  })

  it("does not record a path for a leading null value (guards the recursive wrap of a null field)", () => {
    // No EvidenceModel field is ever actually null in practice (this
    // codebase uses `| undefined` for "absent", never `| null`) -- this
    // exercises wrap()'s defensive null branch directly, the same way
    // deep-freeze.test.ts exercises deepFreeze(null).
    const evidenceWithNull = {
      ...makeEvidenceModel(),
      provenance: { generatedAt: "2026-01-01T00:00:00.000Z", toolVersion: "0.1.0", commit: null },
    } as unknown as EvidenceModel
    const projection = defineEvidenceProjection({
      commit: (evidence) => evidence.provenance.commit,
    })
    expect(projection(evidenceWithNull)).toEqual({ commit: null })
  })

  it("throws when a projector assigns to an EvidenceModel property", () => {
    const projection = defineEvidenceProjection({
      bad: (evidence) => {
        ;(evidence as unknown as { schemaVersion: number }).schemaVersion = 2
        return "unreachable"
      },
    })
    expect(() => projection(makeEvidenceModel())).toThrow(TypeError)
  })

  it("throws when a projector deletes an EvidenceModel property", () => {
    const projection = defineEvidenceProjection({
      bad: (evidence) => {
        delete (evidence as unknown as Record<string, unknown>).change
        return "unreachable"
      },
    })
    expect(() => projection(makeEvidenceModel())).toThrow(TypeError)
  })

  it("throws when a projector calls Object.defineProperty on the EvidenceModel", () => {
    const projection = defineEvidenceProjection({
      bad: (evidence) => {
        Object.defineProperty(evidence, "extra", { value: 1 })
        return "unreachable"
      },
    })
    expect(() => projection(makeEvidenceModel())).toThrow(TypeError)
  })

  it("throws when a projector calls Object.setPrototypeOf on the EvidenceModel", () => {
    const projection = defineEvidenceProjection({
      bad: (evidence) => {
        Object.setPrototypeOf(evidence, null)
        return "unreachable"
      },
    })
    expect(() => projection(makeEvidenceModel())).toThrow(TypeError)
  })

  it("throws when a projector mutates a nested object, not just the top-level EvidenceModel", () => {
    const projection = defineEvidenceProjection({
      bad: (evidence) => {
        ;(evidence.contract as unknown as { schemaVersion: number }).schemaVersion = 99
        return "unreachable"
      },
    })
    expect(() => projection(makeEvidenceModel())).toThrow(TypeError)
  })

  it("never mutates the caller's original EvidenceModel, even when a projector attempts to", () => {
    const evidence = makeEvidenceModel()
    const projection = defineEvidenceProjection({
      bad: (e) => {
        ;(e as unknown as { schemaVersion: number }).schemaVersion = 2
        return "unreachable"
      },
    })
    expect(() => projection(evidence)).toThrow(TypeError)
    expect(evidence.schemaVersion).toBe(1)
  })
})
