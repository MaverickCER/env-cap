import { describe, it, expect } from "vitest"
import { createEnv } from "../../src/runtime/create.js"
import {
  getContractInternals,
  isEnvContract,
  registerContract,
} from "../../src/runtime/registry.js"

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

  it("returns false for a registered function -- the typeof guard excludes functions even though WeakMap accepts them as keys", () => {
    // `object` (`registerContract`'s parameter type) structurally includes
    // function types, and a function IS a valid `WeakMap` key -- so this is
    // the one case that actually distinguishes the `typeof value ===
    // "object"` guard from a bare `internalsByContract.has(value)` call: a
    // registered non-object key must still read as "not a contract".
    const fn = (): void => {
      /* no-op stand-in for a "contract" -- never actually called */
    }
    registerContract(fn, { name: "fn-contract", schema: {}, id: Symbol("fn"), source: undefined })
    expect(isEnvContract(fn)).toBe(false)
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

  it("throws a clear TypeError with the exact message for a value that was not created by createEnv", () => {
    expect(() => getContractInternals({})).toThrow(TypeError)
    expect(() => getContractInternals({})).toThrow(
      "env-cap: this value was not created by createEnv(). " +
        "validateEnv() and resetEnvCache() only accept contracts returned from createEnv().",
    )
  })
})
