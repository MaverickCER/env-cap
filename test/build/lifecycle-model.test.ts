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

  it("filters variables to only those with at least one lifecycle field set", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [
        makeVariable({ key: "PLAIN" }),
        makeVariable({ key: "EXPIRES", expiresAt: "2027-01-01" }),
        makeVariable({ key: "DEPRECATED", deprecated: true, removeBy: "2027-06-01" }),
        makeVariable({ key: "RENAMED", renamedFrom: "OLD_RENAMED" }),
      ],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts[0]?.variables.map((v) => v.key)).toEqual([
      "DEPRECATED",
      "EXPIRES",
      "RENAMED",
    ])
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
    expect(model.expiring[0].file).toBe("a/env.schema.ts")
  })
})
