import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { humanizeKey } from "../../src/build/humanize-key.js"

// Metadata keys are identifiers: letters and digits.
const identifier = fc.stringMatching(/^[A-Za-z0-9]{0,24}$/)

describe("humanizeKey -- property-based", () => {
  it("never throws, whatever string it is given", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (key) => typeof humanizeKey(key) === "string"),
      { numRuns: 300 },
    )
  })

  it("only inserts spaces and capitalises the first letter -- nothing else about the key changes", () => {
    fc.assert(
      fc.property(identifier, (key) => {
        const result = humanizeKey(key)
        expect(result.split(" ").join("")).toBe(key.charAt(0).toUpperCase() + key.slice(1))
      }),
      { numRuns: 300 },
    )
  })

  it("never lets two spaces touch, and never starts or ends with one", () => {
    fc.assert(
      fc.property(identifier, (key) => {
        const result = humanizeKey(key)
        expect(result).not.toMatch(/ {2}/)
        expect(result).not.toMatch(/^ | $/)
      }),
      { numRuns: 300 },
    )
  })

  it("is idempotent: labelling a label leaves it alone", () => {
    fc.assert(
      fc.property(identifier, (key) => {
        const once = humanizeKey(key)
        expect(humanizeKey(once)).toBe(once)
      }),
      { numRuns: 300 },
    )
  })

  it("splits a camelCase boundary into two words", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z]{1,8}$/),
        fc.stringMatching(/^[A-Z][a-z]{0,8}$/),
        (head, tail) => {
          expect(humanizeKey(`${head}${tail}`)).toBe(
            `${head.charAt(0).toUpperCase()}${head.slice(1)} ${tail}`,
          )
        },
      ),
      { numRuns: 200 },
    )
  })
})
