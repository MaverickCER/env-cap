import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { deepEqual } from "../../src/build/deep-equal.js"

// The values `deepEqual` compares are always JSON-safe (see its own doc comment), so that is what is generated.
const jsonValue = fc.jsonValue()

/** The same value with one string leaf (or, if there is none, one array/object slot) made different. */
function withOneLeafChanged(value: unknown): unknown {
  if (typeof value === "string") return `${value}!`
  // `value + 1` can equal `value` past 2^53; doubling a non-zero finite number never does.
  if (typeof value === "number") return value === 0 ? 1 : value * 2
  if (typeof value === "boolean") return !value
  if (value === null) return 0
  if (Array.isArray(value)) {
    const items = value as unknown[]
    return items.length === 0 ? [null] : [withOneLeafChanged(items[0]), ...items.slice(1)]
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return { added: true }
  const [[key, first], ...rest] = entries as [[string, unknown], ...[string, unknown][]]
  return Object.fromEntries([[key, withOneLeafChanged(first)], ...rest])
}

describe("deepEqual -- property-based", () => {
  it("is reflexive", () => {
    fc.assert(
      fc.property(jsonValue, (value) => deepEqual(value, value)),
      { numRuns: 200 },
    )
  })

  it("treats a value and its structured clone as equal", () => {
    fc.assert(
      fc.property(jsonValue, (value) => deepEqual(value, structuredClone(value))),
      {
        numRuns: 200,
      },
    )
  })

  it("is symmetric", () => {
    fc.assert(
      fc.property(jsonValue, jsonValue, (a, b) => deepEqual(a, b) === deepEqual(b, a)),
      { numRuns: 300 },
    )
  })

  it("tells a value from the same value with one leaf changed", () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        const changed = withOneLeafChanged(structuredClone(value))
        expect(deepEqual(value, changed)).toBe(false)
        expect(deepEqual(changed, value)).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it("does not depend on the order an object's keys were written in", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string({ maxLength: 8 }), fc.jsonValue()), (record) => {
        const reversed = Object.fromEntries(Object.entries(record).reverse())
        expect(deepEqual(record, reversed)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })
})
