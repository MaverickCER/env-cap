import { describe, expect, it } from "vitest"
import { deepEqual } from "../../src/build/deep-equal.js"

describe("deepEqual", () => {
  it("treats identical primitives as equal, via ===", () => {
    expect(deepEqual("a", "a")).toBe(true)
    expect(deepEqual(1, 1)).toBe(true)
    expect(deepEqual(true, true)).toBe(true)
    expect(deepEqual(null, null)).toBe(true)
    expect(deepEqual(undefined, undefined)).toBe(true)
  })

  it("treats different primitives, or a primitive vs. an object, as unequal", () => {
    expect(deepEqual("a", "b")).toBe(false)
    expect(deepEqual(1, 2)).toBe(false)
    expect(deepEqual(1, "1")).toBe(false)
    expect(deepEqual(null, {})).toBe(false)
    expect(deepEqual({}, null)).toBe(false)
  })

  it("treats two structurally-identical objects as equal, even across separate instances", () => {
    expect(deepEqual({ a: 1, b: "two" }, { a: 1, b: "two" })).toBe(true)
  })

  it("treats objects with a differing value, or a differing key count, as unequal", () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false)
  })

  it("treats two structurally-identical arrays as equal, even across separate instances", () => {
    expect(deepEqual([1, "two", true], [1, "two", true])).toBe(true)
  })

  it("treats arrays with a differing element, or a differing length, as unequal", () => {
    expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false)
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false)
    expect(deepEqual([1, 2, 3], [1, 2])).toBe(false)
  })

  it("treats an array and a plain object as unequal, even with matching numeric-like content", () => {
    expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false)
    expect(deepEqual({ 0: 1, 1: 2 }, [1, 2])).toBe(false)
  })

  it("treats an array and a plain object as unequal even when the object has a matching own .length property too", () => {
    // Once at least one side is known to be an array, `a.length !== b.length`
    // alone can't tell "one side isn't an array" apart from "both are arrays
    // with the same length" -- a plain object that happens to declare its
    // own `length` matching the array's is the one input that exposes this:
    // `!Array.isArray(a) || !Array.isArray(b)` is what actually catches it.
    expect(deepEqual([1, 2], { length: 2, 0: 1, 1: 2 })).toBe(false)
    expect(deepEqual({ length: 2, 0: 1, 1: 2 }, [1, 2])).toBe(false)
  })

  it("recurses into nested objects and arrays, at any depth", () => {
    const a = { controls: { encryption: true, regions: ["EU", "US"] }, count: 2 }
    const b = { controls: { encryption: true, regions: ["EU", "US"] }, count: 2 }
    expect(deepEqual(a, b)).toBe(true)

    const c = { controls: { encryption: true, regions: ["EU", "US"] }, count: 2 }
    const d = { controls: { encryption: true, regions: ["EU", "DE"] }, count: 2 }
    expect(deepEqual(c, d)).toBe(false)
  })
})
