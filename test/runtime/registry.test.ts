import { describe, it, expect } from "vitest"
import { createEnv } from "../../src/runtime/create.js"
import { getContractInternals, isEnvContract } from "../../src/runtime/registry.js"

describe("isEnvContract", () => {
  it("returns true for objects returned by createEnv", () => {
    const contract = createEnv({ A: {} }, { name: "registry-test" })
    expect(isEnvContract(contract)).toBe(true)
  })

  it("returns false for plain objects, arrays, and primitives", () => {
    expect(isEnvContract({})).toBe(false)
    expect(isEnvContract([])).toBe(false)
    expect(isEnvContract(null)).toBe(false)
    expect(isEnvContract(undefined)).toBe(false)
    expect(isEnvContract("STRIPE_KEY")).toBe(false)
  })
})

describe("getContractInternals", () => {
  it("returns the schema/name/id for a real contract", () => {
    const contract = createEnv({ A: {} }, { name: "internals-test" })
    const internals = getContractInternals(contract)
    expect(internals.name).toBe("internals-test")
    expect(Object.keys(internals.schema)).toEqual(["A"])
    expect(typeof internals.id).toBe("symbol")
  })

  it("throws a clear TypeError for a value that was not created by createEnv", () => {
    expect(() => getContractInternals({})).toThrow(TypeError)
    expect(() => getContractInternals({})).toThrow(/createEnv/)
  })
})
