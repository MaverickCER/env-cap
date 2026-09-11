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

  it("sorts contracts by file then exportName, not input order", () => {
    const zContract = makeContract({
      file: "/repo/z/env.schema.ts",
      exportName: "zEnv",
      variables: [],
    })
    const aContract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [],
    })
    const model = buildOwnershipModel([zContract, aContract], "/repo")
    expect(model.contracts.map((c) => c.file)).toEqual(["a/env.schema.ts", "z/env.schema.ts"])
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

    expect(model.unownedContracts).toEqual([{ file: "b/env.schema.ts", exportName: "bEnv" }])
    expect(model.unownedVariables).toEqual([
      { file: "b/env.schema.ts", exportName: "bEnv", key: "ORPHAN" },
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
      { file: "a/env.schema.ts", exportName: "aEnv", key: "KEY" },
    ])
  })
})
