import { describe, expect, it } from "vitest"
import { buildChangeModel, CHANGE_MODEL_SCHEMA_VERSION } from "../../src/build/change-model.js"
import type { DiscoveredContract, DiscoveredVariable } from "../../src/build/link.js"
import type {
  ManifestChangeReport,
  ManifestVariableRef,
} from "../../src/build/manifest-snapshot.js"

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
    classification: undefined,
    expiresAt: undefined,
    refreshInstructions: undefined,
    required: undefined,
    deprecated: undefined,
    deprecatedReason: undefined,
    removeBy: undefined,
    renamedFrom: undefined,
    extra: {},
    documented: true,
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
    classification: undefined,
    expiresAt: undefined,
    deprecated: undefined,
    deprecatedReason: undefined,
    metadata: undefined,
    documented: true,
    packageOrigin: undefined,
    ...overrides,
  }
}

function variableRef(
  overrides: Partial<ManifestVariableRef> & { key: string; contractIdentity: string },
): ManifestVariableRef {
  return {
    identity: `${overrides.contractIdentity}#${overrides.key}`,
    file: "a/env.schema.ts",
    exportName: "aEnv",
    contractName: "a",
    ...overrides,
  }
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
          identity: "a/env.schema.ts#aEnv",
          file: "a/env.schema.ts",
          exportName: "aEnv",
          contractName: "a",
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
    const contractIdentity = "a/env.schema.ts#aEnv"
    const report: ManifestChangeReport = {
      ...EMPTY_REPORT,
      addedVariables: [variableRef({ contractIdentity, key: "NEW_KEY" })],
      removedVariables: [variableRef({ contractIdentity, key: "OLD_KEY" })],
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
        contractIdentity,
        file: "a/env.schema.ts",
        exportName: "aEnv",
        contractName: "a",
        previousKey: "OLD_KEY",
        currentKey: "NEW_KEY",
      },
    ])
    // The legacy report itself is untouched -- the rename's two halves still appear there too.
    expect(model.manifest.addedVariables).toHaveLength(1)
    expect(model.manifest.removedVariables).toHaveLength(1)
  })

  it("does not correlate a rename when renamedFrom points to a key that isn't actually in removedVariables", () => {
    const contractIdentity = "a/env.schema.ts#aEnv"
    const report: ManifestChangeReport = {
      ...EMPTY_REPORT,
      addedVariables: [variableRef({ contractIdentity, key: "NEW_KEY" })],
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
      addedVariables: [variableRef({ contractIdentity: "a/env.schema.ts#aEnv", key: "NEW_KEY" })],
      // The matching key exists, but under a different contract.
      removedVariables: [
        variableRef({
          contractIdentity: "b/env.schema.ts#bEnv",
          key: "OLD_KEY",
          file: "b/env.schema.ts",
          exportName: "bEnv",
          contractName: "b",
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
          contractIdentity: "b/env.schema.ts#bEnv",
          key: "NEW_B",
          file: "b/env.schema.ts",
          exportName: "bEnv",
          contractName: "b",
        }),
        variableRef({
          contractIdentity: "a/env.schema.ts#aEnv",
          key: "NEW_A",
        }),
      ],
      removedVariables: [
        variableRef({
          contractIdentity: "b/env.schema.ts#bEnv",
          key: "OLD_B",
          file: "b/env.schema.ts",
          exportName: "bEnv",
          contractName: "b",
        }),
        variableRef({
          contractIdentity: "a/env.schema.ts#aEnv",
          key: "OLD_A",
        }),
      ],
    }

    const model = buildChangeModel(report, contracts, "/repo")
    expect(model.renamedVariables.map((r) => r.currentKey)).toEqual(["NEW_A", "NEW_B"])
  })

  it("sorts two renamed variables within the same contract by current key", () => {
    const contractIdentity = "a/env.schema.ts#aEnv"
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
      addedVariables: [
        variableRef({ contractIdentity, key: "Z_NEW" }),
        variableRef({ contractIdentity, key: "A_NEW" }),
      ],
      removedVariables: [
        variableRef({ contractIdentity, key: "Z_OLD" }),
        variableRef({ contractIdentity, key: "A_OLD" }),
      ],
    }

    const model = buildChangeModel(report, contracts, "/repo")
    expect(model.renamedVariables.map((r) => r.currentKey)).toEqual(["A_NEW", "Z_NEW"])
  })
})
