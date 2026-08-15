import { describe, expect, it } from "vitest"
import { deepFreeze } from "../../src/build/deep-freeze.js"

describe("deepFreeze", () => {
  it("freezes a plain object at its top level", () => {
    const value = deepFreeze({ a: 1 })
    expect(Object.isFrozen(value)).toBe(true)
    expect(() => {
      value.a = 2
    }).toThrow(TypeError)
  })

  it("freezes an array at its top level", () => {
    const value = deepFreeze([1, 2, 3])
    expect(Object.isFrozen(value)).toBe(true)
  })

  it("recursively freezes nested objects", () => {
    const value = deepFreeze({ a: { b: { c: 1 } } })
    expect(Object.isFrozen(value.a)).toBe(true)
    expect(Object.isFrozen(value.a.b)).toBe(true)
    expect(() => {
      value.a.b.c = 2
    }).toThrow(TypeError)
  })

  it("recursively freezes objects nested inside arrays, and arrays nested inside objects", () => {
    const value = deepFreeze({ items: [{ id: 1 }, { id: 2 }] })
    expect(Object.isFrozen(value.items)).toBe(true)
    expect(Object.isFrozen(value.items[0])).toBe(true)
    expect(() => {
      value.items[0].id = 99
    }).toThrow(TypeError)
  })

  it("recursively freezes arrays nested inside arrays", () => {
    const value = deepFreeze([
      [1, 2],
      [3, 4],
    ])
    expect(Object.isFrozen(value[0])).toBe(true)
    expect(Object.isFrozen(value[1])).toBe(true)
  })

  it("leaves primitives untouched (no error freezing a number/string/boolean/null)", () => {
    expect(deepFreeze(42)).toBe(42)
    expect(deepFreeze("hello")).toBe("hello")
    expect(deepFreeze(true)).toBe(true)
    expect(deepFreeze(null)).toBeNull()
  })

  it("leaves an undefined value untouched (no error)", () => {
    const withOptional = deepFreeze({ maybe: undefined as string | undefined })
    expect(withOptional.maybe).toBeUndefined()
  })

  it("does not walk into a Map/Set/class instance's contents, only freezes the container itself", () => {
    const map = new Map([["key", { nested: 1 }]])
    const value = deepFreeze({ map })
    expect(Object.isFrozen(value.map)).toBe(true)
    // The Map's own entries are not walked -- this is a deliberate, documented limitation.
    const nested = value.map.get("key")
    expect(Object.isFrozen(nested)).toBe(false)
  })

  it("returns the exact same object reference it was given (freezes in place, no copying)", () => {
    const original = { a: 1 }
    const result = deepFreeze(original)
    expect(result).toBe(original)
  })

  it("handles a self-referential (cyclic) structure without infinite recursion", () => {
    const value: { self?: unknown } = {}
    value.self = value
    expect(() => deepFreeze(value)).not.toThrow()
    expect(Object.isFrozen(value)).toBe(true)
  })

  it("freezes an object created with Object.create(null) (no prototype)", () => {
    const value: { a: number } = Object.create(null) as { a: number }
    value.a = 1
    const frozen = deepFreeze(value)
    expect(Object.isFrozen(frozen)).toBe(true)
  })
})
