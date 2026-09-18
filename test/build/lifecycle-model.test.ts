import { describe, expect, it } from "vitest"
import type { DiscoveredContract, DiscoveredVariable } from "../../src/build/link.js"
import {
  buildLifecycleModel,
  LIFECYCLE_MODEL_SCHEMA_VERSION,
} from "../../src/build/lifecycle-model.js"

const NOW = new Date("2026-01-01T00:00:00.000Z")

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

describe("buildLifecycleModel", () => {
  it("carries the current schema version and root-relative, POSIX-separated file paths", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      expiresAt: "2027-01-01",
      variables: [],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.schemaVersion).toBe(LIFECYCLE_MODEL_SCHEMA_VERSION)
    expect(model.contracts[0]?.file).toBe("a/env.schema.ts")
  })

  it("omits a contract entirely when neither it nor any of its variables have lifecycle data", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [makeVariable({ key: "PLAIN" })],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts).toEqual([])
  })

  it("includes a contract when only the contract level has lifecycle data, with an empty variables array", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      deprecated: true,
      deprecatedReason: "Superseded by aEnv-v2.",
      variables: [makeVariable({ key: "PLAIN" })],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts).toHaveLength(1)
    expect(model.contracts[0]?.deprecated).toBe(true)
    expect(model.contracts[0]?.deprecatedReason).toBe("Superseded by aEnv-v2.")
    expect(model.contracts[0]?.variables).toEqual([])
  })

  it("includes a contract when ONLY deprecatedReason is set at the contract level (deprecated itself left unset)", () => {
    // The prior test sets `deprecated` and `deprecatedReason` together, so
    // it can't isolate `deprecatedReason !== undefined` from `deprecated
    // !== undefined` in the same OR-chain -- this contract has no other
    // contract-level lifecycle field at all.
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      deprecatedReason: "Superseded by aEnv-v2.",
      variables: [makeVariable({ key: "PLAIN" })],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts).toHaveLength(1)
    expect(model.contracts[0]?.deprecatedReason).toBe("Superseded by aEnv-v2.")
  })

  it("includes a contract when ONLY contract-level retention is set (no expiresAt/deprecated/deprecatedReason, no qualifying variables)", () => {
    // Isolates `contract.retention !== undefined` in the `hasContractLevelData`
    // OR-chain -- the same reason the deprecatedReason-only test above exists.
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      retention: "Delete 90 days after the account closes.",
      variables: [makeVariable({ key: "PLAIN" })],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts).toHaveLength(1)
    expect(model.contracts[0]?.retention).toBe("Delete 90 days after the account closes.")
    expect(model.contracts[0]?.variables).toEqual([])
  })

  it("filters variables to only those with at least one lifecycle field set", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [
        makeVariable({ key: "PLAIN" }),
        makeVariable({ key: "EXPIRES", expiresAt: "2027-01-01" }),
        makeVariable({ key: "DEPRECATED", deprecated: true, removeBy: "2027-06-01" }),
        makeVariable({ key: "RENAMED", renamedFrom: "OLD_RENAMED" }),
        makeVariable({ key: "REFRESH_ONLY", refreshInstructions: "Rotate in the vault." }),
        makeVariable({ key: "RETENTION_ONLY", retention: "90 days" }),
      ],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts[0]?.variables.map((v) => v.key)).toEqual([
      "DEPRECATED",
      "EXPIRES",
      "REFRESH_ONLY",
      "RENAMED",
      "RETENTION_ONLY",
    ])
  })

  it("filters in a variable when ONLY deprecated is set (no expiresAt/refreshInstructions/removeBy/renamedFrom/retention)", () => {
    // Isolates `variable.deprecated !== undefined` in `hasLifecycleData`'s
    // OR-chain -- every other test combines it with removeBy or other
    // fields, which alone would already satisfy the OR.
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [makeVariable({ key: "DEPRECATED_ONLY", deprecated: true })],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts[0]?.variables.map((v) => v.key)).toEqual(["DEPRECATED_ONLY"])
  })

  it("filters in a variable when ONLY removeBy is set (no expiresAt/deprecated/refreshInstructions/renamedFrom/retention)", () => {
    // Isolates `variable.removeBy !== undefined` in `hasLifecycleData`'s
    // OR-chain -- every other test combines it with `deprecated`, which
    // alone would already satisfy the OR.
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [makeVariable({ key: "REMOVE_ONLY", removeBy: "2027-06-01" })],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts[0]?.variables.map((v) => v.key)).toEqual(["REMOVE_ONLY"])
  })

  it("carries every lifecycle field through to the variable entry", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [
        makeVariable({
          key: "OLD_KEY",
          expiresAt: "2027-01-01",
          refreshInstructions: "Rotate in the vault.",
          deprecated: true,
          deprecatedReason: "Renamed for clarity.",
          removeBy: "2027-06-01",
          renamedFrom: "ANCIENT_KEY",
        }),
      ],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts[0]?.variables).toEqual([
      {
        key: "OLD_KEY",
        expiresAt: "2027-01-01",
        refreshInstructions: "Rotate in the vault.",
        deprecated: true,
        deprecatedReason: "Renamed for clarity.",
        removeBy: "2027-06-01",
        renamedFrom: "ANCIENT_KEY",
      },
    ])
  })

  it("sorts contracts deterministically by file, then exportName", () => {
    const b = makeContract({
      file: "/repo/b/env.schema.ts",
      exportName: "bEnv",
      deprecated: true,
      variables: [],
    })
    const a = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      deprecated: true,
      variables: [],
    })
    const model1 = buildLifecycleModel([b, a], 30, NOW, "/repo")
    const model2 = buildLifecycleModel([a, b], 30, NOW, "/repo")
    expect(model1).toEqual(model2)
    expect(model1.contracts.map((c) => c.file)).toEqual(["a/env.schema.ts", "b/env.schema.ts"])
  })

  it("promotes computeExpiringEntries() into the model's expiring field, with file relativized to root", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [makeVariable({ key: "SOON", expiresAt: "2026-01-15" })],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.expiring).toHaveLength(1)
    expect(model.expiring[0]).toMatchObject({ key: "SOON", expiresAt: "2026-01-15" })
    // Unlike ExpiringEntry's own doc comment (an absolute path, in
    // computeExpiringEntries()'s other direct consumers), LifecycleModel's
    // own `expiring` field is root-relative -- matching every other
    // canonical model's file convention, not the absolute path
    // computeExpiringEntries() itself returns.
    expect(model.expiring[0]!.file).toBe("a/env.schema.ts")
  })
})
