import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { deepEqual } from "../../src/build/deep-equal.js"
import { deepFreeze } from "../../src/build/deep-freeze.js"

/** Every array and object reachable from `value`, itself included. */
function reachableContainers(value: unknown, into: object[] = []): object[] {
  if (value === null || typeof value !== "object") return into
  into.push(value)
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    reachableContainers(child, into)
  }
  return into
}

describe("deepFreeze -- property-based", () => {
  it("returns the very value it was given, with the structure unchanged", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const snapshot = structuredClone(value)
        const result = deepFreeze(value)
        expect(result).toBe(value)
        expect(deepEqual(result, snapshot)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it("freezes every array and object reachable from the value", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        deepFreeze(value)
        for (const container of reachableContainers(value)) {
          expect(Object.isFrozen(container)).toBe(true)
        }
      }),
      { numRuns: 200 },
    )
  })

  it("makes a write anywhere in the structure throw rather than succeed silently", () => {
    fc.assert(
      fc.property(
        fc.array(fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), fc.jsonValue()), {
          minLength: 1,
        }),
        (value) => {
          deepFreeze(value)
          expect(() => {
            ;(value as unknown[]).push({})
          }).toThrow(TypeError)
          const first = value[0] as Record<string, unknown>
          expect(() => {
            first["__added__"] = 1
          }).toThrow(TypeError)
        },
      ),
      { numRuns: 100 },
    )
  })

  it("is idempotent", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const once = deepFreeze(value)
        const twice = deepFreeze(once)
        expect(twice).toBe(once)
      }),
      { numRuns: 100 },
    )
  })

  it("terminates on a cyclic structure and still freezes it", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 5 }), (items) => {
        const node: { items: string[]; self?: unknown } = { items }
        node.self = node
        deepFreeze(node)
        expect(Object.isFrozen(node)).toBe(true)
        expect(Object.isFrozen(node.items)).toBe(true)
      }),
      { numRuns: 50 },
    )
  })
})
