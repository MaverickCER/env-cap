import { describe, expect, it } from "vitest"
import type { DiscoveredContract, DiscoveredVariable } from "../../src/build/link.js"
import {
  buildOwnershipModel,
  OWNERSHIP_MODEL_SCHEMA_VERSION,
} from "../../src/build/ownership-model.js"

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

describe("buildOwnershipModel", () => {
  it("carries the current schema version and root-relative, POSIX-separated file paths", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [],
    })
    const model = buildOwnershipModel([contract], "/repo")
    expect(model.schemaVersion).toBe(OWNERSHIP_MODEL_SCHEMA_VERSION)
    expect(model.contracts[0]?.file).toBe("a/env.schema.ts")
  })

  it("resolves each variable's effective owner -- its own override, falling back to the contract's", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      owner: "contract-team",
      variables: [
        makeVariable({ key: "OVERRIDDEN", owner: "variable-team" }),
        makeVariable({ key: "FALLS_BACK" }),
      ],
    })
    const model = buildOwnershipModel([contract], "/repo")
    expect(model.contracts[0]?.variables).toEqual([
      { key: "FALLS_BACK", owner: "contract-team" },
      { key: "OVERRIDDEN", owner: "variable-team" },
    ])
  })

  it("itemizes unowned contracts and variables as first-class arrays, not just a count", () => {
    const owned = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      owner: "team-a",
      variables: [makeVariable({ key: "KEY" })],
    })
    const unowned = makeContract({
      file: "/repo/b/env.schema.ts",
      exportName: "bEnv",
      variables: [makeVariable({ key: "ORPHAN" })],
    })
    const model = buildOwnershipModel([owned, unowned], "/repo")

    expect(model.unownedContracts).toEqual([
      { file: "b/env.schema.ts", exportName: "bEnv", contractName: "bEnv" },
    ])
    expect(model.unownedVariables).toEqual([
      { file: "b/env.schema.ts", exportName: "bEnv", contractName: "bEnv", key: "ORPHAN" },
    ])
  })

  it("does not flag a variable as unowned when it falls back to a contract-level owner", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      owner: "contract-team",
      variables: [makeVariable({ key: "KEY" })],
    })
    const model = buildOwnershipModel([contract], "/repo")
    expect(model.unownedContracts).toEqual([])
    expect(model.unownedVariables).toEqual([])
  })

  it("includes inactive contracts too, matching renderSecurityReview()'s existing noOwnerCount scope", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      active: false,
      variables: [makeVariable({ key: "KEY" })],
    })
    const model = buildOwnershipModel([contract], "/repo")
    expect(model.unownedVariables).toEqual([
      { file: "a/env.schema.ts", exportName: "aEnv", contractName: "aEnv", key: "KEY" },
    ])
  })
})
