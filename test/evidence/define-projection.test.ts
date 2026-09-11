import { describe, expect, it } from "vitest"
import type { EvidenceModel } from "../../src/build/evidence-model.js"
import {
  defineEvidenceProjection,
  readOnlyMembraneError,
} from "../../src/evidence/define-projection.js"

// `.toThrow(someString)` is a SUBSTRING match, not exact equality -- every
// string contains "" as a substring, so `.toThrow("")` trivially passes
// regardless of what actually threw, defeating the whole point of pinning
// the exact message (a StringLiteral mutant collapsing the message to ""
// would sail through unnoticed). Catching directly and asserting exact
// equality closes that gap.
// The literal message text is hardcoded here, NOT derived by calling
// `readOnlyMembraneError()` from inside the assertion -- doing that would
// compare the (possibly-mutated) thrown message against the SAME
// (identically-mutated) function's own output, trivially "matching" no
// matter what the message actually says.
const READ_ONLY_MESSAGE =
  "EvidenceModel is read-only inside a projector -- a projection must be a pure function of its evidence argument. See ADR 0032."

function expectReadOnlyThrow(fn: () => unknown): void {
  expect(fn).toThrow(TypeError)
  try {
    fn()
    expect.fail("should have thrown")
  } catch (error) {
    expect(error).toBeInstanceOf(TypeError)
    expect((error as TypeError).message).toBe(READ_ONLY_MESSAGE)
  }
}

it("readOnlyMembraneError() itself carries the exact expected message", () => {
  expect(readOnlyMembraneError().message).toBe(READ_ONLY_MESSAGE)
})

function makeEvidenceModel(): EvidenceModel {
  return {
    schemaVersion: 1,
    provenance: {
      generatedAt: "2026-01-01T00:00:00.000Z",
      toolVersion: "0.1.0",
      commit: "abc123",
    },
    contract: {
      schemaVersion: 3,
      contracts: [
        {
          file: "/repo/src/payments/env.schema.ts",
          exportName: "paymentsEnv",
          contractName: "payments",
          active: true,
          category: undefined,
          exclusiveGroup: undefined,
          owner: "payments-team",
          sensitivity: undefined,
          expiresAt: undefined,
          purpose: undefined,
          legalBasis: undefined,
          retention: undefined,
          dataResidency: undefined,
          auditRequired: undefined,
          metadata: undefined,
          documented: true,
          packageOrigin: undefined,
          declaration: { file: "/repo/src/payments/env.schema.ts", line: 1, column: 1 },
          documentation: { file: "/repo/src/payments/env.schema.ts", line: 10, column: 1 },
          variables: [
            {
              key: "STRIPE_KEY",
              declaration: { file: "/repo/src/payments/env.schema.ts", line: 2, column: 3 },
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
              sensitivity: "secret",
              expiresAt: undefined,
              refreshInstructions: undefined,
              setupInstructions: undefined,
              required: true,
              purpose: undefined,
              legalBasis: undefined,
              retention: undefined,
              dataResidency: undefined,
              auditRequired: undefined,
              metadata: undefined,
              documented: true,
              evidence: undefined,
            },
            {
              key: "STRIPE_WEBHOOK_SECRET",
              declaration: { file: "/repo/src/payments/env.schema.ts", line: 3, column: 3 },
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
              sensitivity: undefined,
              expiresAt: undefined,
              refreshInstructions: undefined,
              setupInstructions: undefined,
              required: true,
              purpose: undefined,
              legalBasis: undefined,
              retention: undefined,
              dataResidency: undefined,
              auditRequired: undefined,
              metadata: undefined,
              documented: false,
              evidence: undefined,
            },
          ],
        },
      ],
    },
    dependency: {
      schemaVersion: 2,
      contracts: [
        {
          file: "/repo/src/payments/env.schema.ts",
          exportName: "paymentsEnv",
          contractName: "payments",
          imported: true,
          hasDynamicAccess: false,
          variables: [
            {
              key: "STRIPE_KEY",
              status: "used",
              positions: [{ file: "/repo/src/payments/charge.ts", line: 12, column: 5 }],
              dynamicAccessAssertions: [],
            },
            {
              key: "STRIPE_WEBHOOK_SECRET",
              status: "unconsumed",
              positions: [],
              dynamicAccessAssertions: [],
            },
          ],
          consumingFiles: ["/repo/src/payments/charge.ts"],
          ambiguousBarrelFiles: [],
          dynamicAccessSites: [],
        },
      ],
      consumers: [
        {
          file: "/repo/src/payments/charge.ts",
          contracts: [
            {
              file: "/repo/src/payments/env.schema.ts",
              exportName: "paymentsEnv",
            },
          ],
        },
      ],
      warnings: [],
      scannedSurfaces: [{ label: "application", root: "." }],
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
      schemaVersion: 2,
      contracts: [],
      expiring: [],
    },
    finding: {
      schemaVersion: 3,
      findings: [
        {
          severity: "warning",
          code: "UNDOCUMENTED_VARIABLE",
          family: "documentation",
          message: "STRIPE_WEBHOOK_SECRET is undocumented",
          location: {
            model: "contract",
            file: "/repo/src/payments/env.schema.ts",
            exportName: "paymentsEnv",
            variable: "STRIPE_WEBHOOK_SECRET",
            position: undefined,
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

  it("reports source paths sorted alphabetically, not in read order", () => {
    const projection = defineEvidenceProjection({
      // Reads "finding" (a field that alphabetically sorts LAST) before
      // "contract" (which sorts before it) -- if `readPaths()` returned
      // paths in read order rather than sorted, this would come back
      // ["finding", "contract"], not the alphabetical order asserted below.
      value: (evidence) => {
        const findingCount = evidence.finding.findings.length
        const contractCount = evidence.contract.contracts.length
        return findingCount + contractCount
      },
    })
    const { sources } = projection.project(makeEvidenceModel())
    expect(sources.value).toEqual(["contract", "contract.contracts", "finding", "finding.findings"])
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
    expectReadOnlyThrow(() => projection(makeEvidenceModel()))
  })

  it("throws when a projector deletes an EvidenceModel property", () => {
    const projection = defineEvidenceProjection({
      bad: (evidence) => {
        delete (evidence as unknown as Record<string, unknown>).change
        return "unreachable"
      },
    })
    expectReadOnlyThrow(() => projection(makeEvidenceModel()))
  })

  it("throws when a projector calls Object.defineProperty on the EvidenceModel", () => {
    const projection = defineEvidenceProjection({
      bad: (evidence) => {
        Object.defineProperty(evidence, "extra", { value: 1 })
        return "unreachable"
      },
    })
    expectReadOnlyThrow(() => projection(makeEvidenceModel()))
  })

  it("throws when a projector calls Object.setPrototypeOf on the EvidenceModel", () => {
    const projection = defineEvidenceProjection({
      bad: (evidence) => {
        Object.setPrototypeOf(evidence, null)
        return "unreachable"
      },
    })
    expectReadOnlyThrow(() => projection(makeEvidenceModel()))
  })

  it("throws when a projector mutates a nested object, not just the top-level EvidenceModel", () => {
    const projection = defineEvidenceProjection({
      bad: (evidence) => {
        ;(evidence.contract as unknown as { schemaVersion: number }).schemaVersion = 99
        return "unreachable"
      },
    })
    expectReadOnlyThrow(() => projection(makeEvidenceModel()))
  })

  it("never mutates the caller's original EvidenceModel, even when a projector attempts to", () => {
    const evidence = makeEvidenceModel()
    const projection = defineEvidenceProjection({
      bad: (e) => {
        ;(e as unknown as { schemaVersion: number }).schemaVersion = 2
        return "unreachable"
      },
    })
    expectReadOnlyThrow(() => projection(evidence))
    expect(evidence.schemaVersion).toBe(1)
  })
})
