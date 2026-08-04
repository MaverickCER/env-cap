import { beforeEach, describe, expect, it } from "vitest"
import {
  getContractError,
  getContractValues,
  getState,
  resetCache,
  setContractError,
  setContractValues,
} from "../../src/runtime/cache.js"
import { EnvValidationError } from "../../src/runtime/errors.js"

beforeEach(() => {
  resetCache()
})

describe("getState", () => {
  it("starts uninitialized with no tracked contracts", () => {
    const state = getState()
    expect(state.status).toBe("uninitialized")
    expect(state.contractIds.size).toBe(0)
  })

  it("returns the same state object across calls (single global state, not per-call)", () => {
    const first = getState()
    first.status = "ready"
    const second = getState()
    expect(second).toBe(first)
    expect(second.status).toBe("ready")
  })
})

describe("contract value cache", () => {
  it("round-trips values through set/getContractValues", () => {
    const id = Symbol("cache-test-contract")
    expect(getContractValues(id)).toBeUndefined()

    const values = Object.freeze({ KEY: "value" })
    setContractValues(id, values)
    expect(getContractValues(id)).toBe(values)
  })

  it("round-trips errors through set/getContractError", () => {
    const id = Symbol("cache-test-error-contract")
    expect(getContractError(id)).toBeUndefined()

    const error = new EnvValidationError([])
    setContractError(id, error)
    expect(getContractError(id)).toBe(error)
  })
})

describe("resetCache", () => {
  it("clears the global state and every contract id tracked under it", () => {
    const state = getState()
    const id = Symbol("cache-test-reset-contract")
    state.contractIds.add(id)
    setContractValues(id, Object.freeze({ A: 1 }))
    state.status = "ready"

    resetCache()

    expect(getContractValues(id)).toBeUndefined()
    expect(getState().status).toBe("uninitialized")
  })

  it("is a no-op (does not throw) when nothing has been tracked yet", () => {
    expect(() => {
      resetCache()
    }).not.toThrow()
  })

  it("leaves contract values untouched if they were never tracked in contractIds", () => {
    // setContractValues/setContractError can in principle be called directly
    // without registering the id in contractIds -- resetCache only clears
    // what validateEnv() tracked, by design.
    const id = Symbol("cache-test-untracked")
    setContractValues(id, Object.freeze({ A: 1 }))

    resetCache()

    expect(getContractValues(id)).toEqual({ A: 1 })
  })
})
