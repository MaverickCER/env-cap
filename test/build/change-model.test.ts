import { describe, expect, it } from "vitest"
import { buildChangeModel, CHANGE_MODEL_SCHEMA_VERSION } from "../../src/build/change-model.js"
import type { DiscoveredContract, DiscoveredVariable } from "../../src/build/link.js"
import type {
  ManifestChangeReport,
  ManifestVariableRef,
} from "../../src/build/evidence-snapshot.js"

const EMPTY_REPORT: ManifestChangeReport = {
  addedContracts: [],
  removedContracts: [],
  addedVariables: [],
  removedVariables: [],
  updatedContracts: [],
  updatedVariables: [],
}

function makeVariable(
  overrides: Partial<DiscoveredVariable> & { key: string },
): DiscoveredVariable {
  return {
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
    required: undefined,
    deprecated: undefined,
    deprecatedReason: undefined,
    removeBy: undefined,
    renamedFrom: undefined,
    purpose: undefined,
    legalBasis: undefined,
    retention: undefined,
    dataResidency: undefined,
    auditRequired: undefined,
    metadata: undefined,
    evidence: undefined,
    documented: true,
    declaration: { file: "/repo/x/env.schema.ts", line: 1, column: 1 },
    ...overrides,
  }
}

function makeContract(
  overrides: Partial<DiscoveredContract> & {
    file: string
    exportName: string
    variables: DiscoveredVariable[]
  },
): DiscoveredContract {
  return {
    contractName: overrides.exportName,
    active: true,
    category: undefined,
    exclusiveGroup: undefined,
    owner: undefined,
    sensitivity: undefined,
    expiresAt: undefined,
    deprecated: undefined,
    deprecatedReason: undefined,
    purpose: undefined,
    legalBasis: undefined,
    retention: undefined,
    dataResidency: undefined,
    auditRequired: undefined,
    metadata: undefined,
    documented: true,
    declaration: { file: "/repo/x/env.schema.ts", line: 1, column: 1 },
    documentation: undefined,
    packageOrigin: undefined,
    ...overrides,
  }
}

function variableRef(
  overrides: Partial<ManifestVariableRef> & { key: string },
): ManifestVariableRef {
  return { file: "a/env.schema.ts", exportName: "aEnv", ...overrides }
}

describe("buildChangeModel", () => {
  it("carries the current schema version", () => {
    const model = buildChangeModel(EMPTY_REPORT, [], "/repo")
    expect(model.schemaVersion).toBe(CHANGE_MODEL_SCHEMA_VERSION)
  })

  it("wraps the given ManifestChangeReport unmodified, doing no computation of its own", () => {
    const report: ManifestChangeReport = {
      addedContracts: [
        {
          file: "a/env.schema.ts",
          exportName: "aEnv",
        },
      ],
      removedContracts: [],
      addedVariables: [],
      removedVariables: [],
      updatedContracts: [],
      updatedVariables: [],
    }
    const model = buildChangeModel(report, [], "/repo")
    expect(model.manifest).toBe(report)
  })

  it("correlates an added+removed variable pair into a rename when the current declaration sets renamedFrom", () => {
    const report: ManifestChangeReport = {
      ...EMPTY_REPORT,
      addedVariables: [variableRef({ key: "NEW_KEY" })],
      removedVariables: [variableRef({ key: "OLD_KEY" })],
    }
    const contracts = [
      makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        variables: [makeVariable({ key: "NEW_KEY", renamedFrom: "OLD_KEY" })],
      }),
    ]

    const model = buildChangeModel(report, contracts, "/repo")
    expect(model.renamedVariables).toEqual([
      {
        contractIdentity: "a/env.schema.ts#aEnv",
        file: "a/env.schema.ts",
        exportName: "aEnv",
        // Resolved from the declaring contract, not carried on the change
        // report's own refs -- see `ContractRef`.
        contractName: "aEnv",
        previousKey: "OLD_KEY",
        currentKey: "NEW_KEY",
      },
    ])
    // The legacy report itself is untouched -- the rename's two halves still appear there too.
    expect(model.manifest.addedVariables).toHaveLength(1)
    expect(model.manifest.removedVariables).toHaveLength(1)
  })

  it("does not correlate a rename when renamedFrom points to a key that isn't actually in removedVariables", () => {
    const report: ManifestChangeReport = {
      ...EMPTY_REPORT,
      addedVariables: [variableRef({ key: "NEW_KEY" })],
      removedVariables: [],
    }
    const contracts = [
      makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        variables: [makeVariable({ key: "NEW_KEY", renamedFrom: "NEVER_EXISTED" })],
      }),
    ]

    const model = buildChangeModel(report, contracts, "/repo")
    expect(model.renamedVariables).toEqual([])
  })

  it("does not pick an added-variable ref sharing exportName+key but declared under a different file", () => {
    // Two DIFFERENT files can share an exportName (only `${file}#${exportName}`
    // is truly unique) -- a decoy ref matching on exportName+key but NOT
    // file must never win, even when it's the FIRST candidate `.find()`
    // sees.
    const report: ManifestChangeReport = {
      ...EMPTY_REPORT,
      addedVariables: [
        variableRef({ file: "decoy/env.schema.ts", exportName: "aEnv", key: "NEW_KEY" }),
        variableRef({ file: "a/env.schema.ts", exportName: "aEnv", key: "NEW_KEY" }),
      ],
      removedVariables: [variableRef({ key: "OLD_KEY" })],
    }
    const contracts = [
      makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        variables: [makeVariable({ key: "NEW_KEY", renamedFrom: "OLD_KEY" })],
      }),
    ]

    const model = buildChangeModel(report, contracts, "/repo")
    expect(model.renamedVariables).toEqual([
      expect.objectContaining({ file: "a/env.schema.ts", currentKey: "NEW_KEY" }),
    ])
  })

  it("does not pick an added-variable ref sharing file+key but declared under a different exportName", () => {
    const report: ManifestChangeReport = {
      ...EMPTY_REPORT,
      addedVariables: [
        variableRef({ file: "a/env.schema.ts", exportName: "decoyEnv", key: "NEW_KEY" }),
        variableRef({ file: "a/env.schema.ts", exportName: "aEnv", key: "NEW_KEY" }),
      ],
      removedVariables: [variableRef({ key: "OLD_KEY" })],
    }
    const contracts = [
      makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        variables: [makeVariable({ key: "NEW_KEY", renamedFrom: "OLD_KEY" })],
      }),
    ]

    const model = buildChangeModel(report, contracts, "/repo")
    expect(model.renamedVariables).toEqual([
      expect.objectContaining({ exportName: "aEnv", currentKey: "NEW_KEY" }),
    ])
  })

  it("does not correlate a rename across two different contracts", () => {
    const contracts = [
      makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        variables: [makeVariable({ key: "NEW_KEY", renamedFrom: "OLD_KEY" })],
      }),
    ]
    const report: ManifestChangeReport = {
      ...EMPTY_REPORT,
      addedVariables: [variableRef({ key: "NEW_KEY" })],
      // The matching key exists, but under a different contract.
      removedVariables: [
        variableRef({
          key: "OLD_KEY",
          file: "b/env.schema.ts",
          exportName: "bEnv",
        }),
      ],
    }

    const model = buildChangeModel(report, contracts, "/repo")
    expect(model.renamedVariables).toEqual([])
  })

  it("ignores a variable with no renamedFrom set", () => {
    const contracts = [
      makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        variables: [makeVariable({ key: "PLAIN" })],
      }),
    ]
    const model = buildChangeModel(EMPTY_REPORT, contracts, "/repo")
    expect(model.renamedVariables).toEqual([])
  })

  it("sorts renamedVariables by contract identity, then current key", () => {
    const contracts = [
      makeContract({
        file: "/repo/b/env.schema.ts",
        exportName: "bEnv",
        variables: [makeVariable({ key: "NEW_B", renamedFrom: "OLD_B" })],
      }),
      makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        variables: [makeVariable({ key: "NEW_A", renamedFrom: "OLD_A" })],
      }),
    ]
    const report: ManifestChangeReport = {
      ...EMPTY_REPORT,
      addedVariables: [
        variableRef({
          key: "NEW_B",
          file: "b/env.schema.ts",
          exportName: "bEnv",
        }),
        variableRef({
          key: "NEW_A",
        }),
      ],
      removedVariables: [
        variableRef({
          key: "OLD_B",
          file: "b/env.schema.ts",
          exportName: "bEnv",
        }),
        variableRef({
          key: "OLD_A",
        }),
      ],
    }

    const model = buildChangeModel(report, contracts, "/repo")
    expect(model.renamedVariables.map((r) => r.currentKey)).toEqual(["NEW_A", "NEW_B"])
  })

  it("sorts two renamed variables within the same contract by current key", () => {
    const contracts = [
      makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        variables: [
          makeVariable({ key: "Z_NEW", renamedFrom: "Z_OLD" }),
          makeVariable({ key: "A_NEW", renamedFrom: "A_OLD" }),
        ],
      }),
    ]
    const report: ManifestChangeReport = {
      ...EMPTY_REPORT,
      addedVariables: [variableRef({ key: "Z_NEW" }), variableRef({ key: "A_NEW" })],
      removedVariables: [variableRef({ key: "Z_OLD" }), variableRef({ key: "A_OLD" })],
    }

    const model = buildChangeModel(report, contracts, "/repo")
    expect(model.renamedVariables.map((r) => r.currentKey)).toEqual(["A_NEW", "Z_NEW"])
  })
})
