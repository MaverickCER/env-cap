import { describe, expect, it } from "vitest"
import type { DiscoveredContract, DiscoveredVariable } from "../../src/build/link.js"
import {
  buildContractModel,
  CONTRACT_MODEL_SCHEMA_VERSION,
} from "../../src/build/contract-model.js"

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

describe("buildContractModel", () => {
  it("carries the current schema version and root-relative, POSIX-separated file paths", () => {
    const contract = makeContract({
      file: "/repo/features/x/env.schema.ts",
      exportName: "xEnv",
      variables: [],
    })
    const model = buildContractModel([contract], "/repo")
    expect(model.schemaVersion).toBe(CONTRACT_MODEL_SCHEMA_VERSION)
    expect(model.contracts[0]?.file).toBe("features/x/env.schema.ts")
  })

  it("is deterministic regardless of input order (contracts, then variables within a contract)", () => {
    const a = makeContract({
      file: "/repo/b/env.schema.ts",
      exportName: "bEnv",
      variables: [makeVariable({ key: "Z" }), makeVariable({ key: "A" })],
    })
    const b = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [makeVariable({ key: "ONE" })],
    })

    const model1 = buildContractModel([a, b], "/repo")
    const model2 = buildContractModel([b, a], "/repo")
    expect(model1).toEqual(model2)
    expect(model1.contracts.map((c) => c.file)).toEqual(["a/env.schema.ts", "b/env.schema.ts"])
    expect(model1.contracts[1]?.variables.map((v) => v.key)).toEqual(["A", "Z"])
  })

  it("includes inactive contracts too, unlike the manifest snapshot", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      active: false,
      variables: [],
    })
    const model = buildContractModel([contract], "/repo")
    expect(model.contracts).toHaveLength(1)
    expect(model.contracts[0]?.active).toBe(false)
  })

  it("captures both AST-derived schema facts and documentEnv() metadata", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      category: "payments",
      owner: "team-a",
      classification: "credential",
      metadata: { runbook: "https://wiki.internal/a" },
      variables: [
        makeVariable({
          key: "KEY",
          hasDefault: true,
          defaultValue: { ok: true, value: 3000 },
          hasProcessor: true,
          processorSource: "(v) => Number(v)",
          processorReturnType: "number",
          hasValidator: true,
          validatorSource: "(v) => v > 0",
          context: "server",
          description: "desc",
          owner: "var-owner",
          classification: "secret",
          expiresAt: "2030-01-01",
          refreshInstructions: "rotate",
          required: true,
          extra: { rotationCadence: "30 days" },
        }),
      ],
    })
    const model = buildContractModel([contract], "/repo")
    expect(model.contracts[0]).toEqual({
      file: "a/env.schema.ts",
      exportName: "aEnv",
      contractName: "aEnv",
      active: true,
      category: "payments",
      exclusiveGroup: undefined,
      owner: "team-a",
      classification: "credential",
      expiresAt: undefined,
      metadata: { runbook: "https://wiki.internal/a" },
      documented: true,
      packageOrigin: undefined,
      variables: [
        {
          key: "KEY",
          hasDefault: true,
          defaultValue: { ok: true, value: 3000 },
          hasProcessor: true,
          processorSource: "(v) => Number(v)",
          processorReturnType: "number",
          hasValidator: true,
          validatorSource: "(v) => v > 0",
          context: "server",
          description: "desc",
          owner: "var-owner",
          classification: "secret",
          expiresAt: "2030-01-01",
          refreshInstructions: "rotate",
          required: true,
          extra: { rotationCadence: "30 days" },
          documented: true,
        },
      ],
    })
  })
})
