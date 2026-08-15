import { describe, expect, it, vi } from "vitest"
import type { DiscoveredContract, DiscoveredVariable } from "../../src/build/link.js"
import {
  applyLiveExpirationOverrides,
  collectVariableNames,
  resolveLiveExpirationDates,
} from "../../src/build/live-expirations.js"

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

describe("collectVariableNames", () => {
  it("returns an empty array for no contracts", () => {
    expect(collectVariableNames([])).toEqual([])
  })

  it("de-duplicates a variable key declared by more than one contract", () => {
    const a = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [makeVariable({ key: "SHARED" }), makeVariable({ key: "A_ONLY" })],
    })
    const b = makeContract({
      file: "/repo/b/env.schema.ts",
      exportName: "bEnv",
      variables: [makeVariable({ key: "SHARED" }), makeVariable({ key: "B_ONLY" })],
    })
    const names = collectVariableNames([a, b])
    expect(names).toHaveLength(3)
    expect(new Set(names)).toEqual(new Set(["SHARED", "A_ONLY", "B_ONLY"]))
  })
})

describe("applyLiveExpirationOverrides", () => {
  it("a valid override wins over the static value", () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "A", expiresAt: "2027-01-01" })],
    })
    const [result] = applyLiveExpirationOverrides([contract], { A: "2026-06-01" })
    expect(result.variables[0]?.expiresAt).toBe("2026-06-01")
  })

  it("a key absent from the overrides record preserves the static value", () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "A", expiresAt: "2027-01-01" })],
    })
    const [result] = applyLiveExpirationOverrides([contract], {})
    expect(result.variables[0]?.expiresAt).toBe("2027-01-01")
  })

  it("an unparseable (non-ISO) override value is ignored and the static value is preserved", () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "A", expiresAt: "2027-01-01" })],
    })
    const [result] = applyLiveExpirationOverrides([contract], { A: "tomorrow" })
    expect(result.variables[0]?.expiresAt).toBe("2027-01-01")
  })

  it("an explicit undefined override (simulating a non-TypeScript caller) preserves the static value, identically to an absent key", () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "A", expiresAt: "2027-01-01" })],
    })
    const missing = applyLiveExpirationOverrides([contract], {})
    const explicitUndefined = applyLiveExpirationOverrides([contract], {
      A: undefined,
    } as unknown as Readonly<Record<string, string>>)
    expect(explicitUndefined).toEqual(missing)
  })

  it("never touches contract-level expiresAt, even when the overrides record has a matching key", () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      contractName: "xEnv",
      expiresAt: "2027-01-01",
      variables: [makeVariable({ key: "xEnv" })],
    })
    const [result] = applyLiveExpirationOverrides([contract], { xEnv: "2026-01-01" })
    expect(result.expiresAt).toBe("2027-01-01")
  })

  it("returns a fully independent copy -- no shared object identity with the input at any depth", () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      metadata: { runbook: "https://example.com" },
      variables: [makeVariable({ key: "A", extra: { setup: "..." } })],
    })
    const [result] = applyLiveExpirationOverrides([contract], {})
    expect(result).not.toBe(contract)
    expect(result.variables).not.toBe(contract.variables)
    expect(result.variables[0]).not.toBe(contract.variables[0])
    expect(result.variables[0]?.extra).not.toBe(contract.variables[0]?.extra)
    expect(result.metadata).not.toBe(contract.metadata)
  })
})

describe("resolveLiveExpirationDates", () => {
  it("omitted callback returns the exact same array reference and invokes nothing", async () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "A", expiresAt: "2027-01-01" })],
    })
    const contracts = [contract]
    const result = await resolveLiveExpirationDates(contracts, undefined)
    expect(result).toBe(contracts)
  })

  it("invokes the callback exactly once regardless of variable/contract count", async () => {
    const a = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [makeVariable({ key: "A1" }), makeVariable({ key: "A2" })],
    })
    const b = makeContract({
      file: "/repo/b/env.schema.ts",
      exportName: "bEnv",
      variables: [makeVariable({ key: "B1" })],
    })
    const liveExpirationDates = vi.fn().mockResolvedValue({})
    await resolveLiveExpirationDates([a, b], liveExpirationDates)
    expect(liveExpirationDates).toHaveBeenCalledTimes(1)
  })

  it("passes the de-duplicated set of discovered variable names to the callback", async () => {
    const a = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [makeVariable({ key: "SHARED" }), makeVariable({ key: "A_ONLY" })],
    })
    const b = makeContract({
      file: "/repo/b/env.schema.ts",
      exportName: "bEnv",
      variables: [makeVariable({ key: "SHARED" })],
    })
    const liveExpirationDates = vi.fn().mockResolvedValue({})
    await resolveLiveExpirationDates([a, b], liveExpirationDates)
    const [receivedNames] = liveExpirationDates.mock.calls[0] as [readonly string[]]
    expect(receivedNames).toHaveLength(2)
    expect(new Set(receivedNames)).toEqual(new Set(["SHARED", "A_ONLY"]))
  })

  it("applies the resolved overrides onto the returned contracts", async () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "A", expiresAt: "2027-01-01" })],
    })
    const result = await resolveLiveExpirationDates([contract], async () => ({ A: "2026-01-01" }))
    expect(result[0]?.variables[0]?.expiresAt).toBe("2026-01-01")
  })

  it("propagates a rejecting callback's error unchanged", async () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "A" })],
    })
    const liveExpirationDates = vi.fn().mockRejectedValue(new Error("boom"))
    await expect(resolveLiveExpirationDates([contract], liveExpirationDates)).rejects.toThrow(
      "boom",
    )
  })

  it("deep-freezes the returned structure so mutation attempts throw", async () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "A", expiresAt: "2027-01-01" })],
    })
    const result = await resolveLiveExpirationDates([contract], async () => ({ A: "2026-01-01" }))
    expect(() => {
      // @ts-expect-error -- intentionally mutating a readonly-typed field to prove runtime immutability.
      result[0].variables[0].expiresAt = "2099-01-01"
    }).toThrow()
    expect(result[0]?.variables[0]?.expiresAt).toBe("2026-01-01")
  })

  it("also freezes a contract's metadata record when present", async () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      metadata: { runbook: "https://example.com" },
      variables: [makeVariable({ key: "A" })],
    })
    const result = await resolveLiveExpirationDates([contract], async () => ({}))
    expect(Object.isFrozen(result[0]?.metadata)).toBe(true)
  })

  it("mutating the returned array never affects the original contracts array passed in", async () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "A", expiresAt: "2027-01-01" })],
    })
    const original = [contract]
    await resolveLiveExpirationDates(original, async () => ({ A: "2026-01-01" }))
    expect(original[0]?.variables[0]?.expiresAt).toBe("2027-01-01")
  })
})
