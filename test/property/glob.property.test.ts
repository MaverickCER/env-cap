import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { globToRegExp } from "../../src/build/glob.js"

// A path segment: what a real file or directory name is made of.
const segment = fc.stringMatching(/^[a-z0-9_-]{1,8}$/)
const path = fc.array(segment, { minLength: 1, maxLength: 5 }).map((parts) => parts.join("/"))

describe("globToRegExp -- property-based", () => {
  it("compiles any string without throwing", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 40 }), (pattern) => {
        expect(globToRegExp(pattern)).toBeInstanceOf(RegExp)
      }),
      { numRuns: 300 },
    )
  })

  it("matches a literal pattern against exactly itself", () => {
    fc.assert(
      fc.property(path, segment, (literal, extra) => {
        const regexp = globToRegExp(literal)
        expect(regexp.test(literal)).toBe(true)
        expect(regexp.test(`${literal}${extra}`)).toBe(false)
        expect(regexp.test(`${extra}/${literal}`)).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it("escapes regular-expression syntax in a literal pattern", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{1,6}$/), fc.stringMatching(/^[a-z]{1,6}$/), (a, b) => {
        // `.` must mean a dot, never "any character".
        const regexp = globToRegExp(`${a}.${b}`)
        expect(regexp.test(`${a}.${b}`)).toBe(true)
        expect(regexp.test(`${a}x${b}`)).toBe(false)
        // `+`, `(` and `[` must not start a group or a class.
        expect(globToRegExp(`${a}+(${b}[`).test(`${a}+(${b}[`)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it("lets a single * match within a segment but never across a slash", () => {
    fc.assert(
      fc.property(segment, path, (name, nested) => {
        const regexp = globToRegExp("*")
        expect(regexp.test(name)).toBe(true)
        expect(regexp.test("")).toBe(true)
        if (nested.includes("/")) expect(regexp.test(nested)).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it("lets ? match exactly one character that is not a slash", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9]$/), (ch) => {
        const regexp = globToRegExp("a?b")
        expect(regexp.test(`a${ch}b`)).toBe(true)
        expect(regexp.test("ab")).toBe(false)
        expect(regexp.test("a/b")).toBe(false)
        expect(regexp.test(`a${ch}${ch}b`)).toBe(false)
      }),
      { numRuns: 100 },
    )
  })

  it("lets ** match any path at all, slashes included", () => {
    fc.assert(
      fc.property(fc.oneof(path, fc.constant("")), (candidate) => {
        expect(globToRegExp("**").test(candidate)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it("lets a leading **/ match the file at the root and nested under any directories", () => {
    fc.assert(
      fc.property(segment, path, (file, directories) => {
        const regexp = globToRegExp(`**/${file}`)
        expect(regexp.test(file)).toBe(true)
        expect(regexp.test(`${directories}/${file}`)).toBe(true)
        expect(regexp.test(`${file}x`)).toBe(false)
        expect(regexp.test(`${directories}/${file}x`)).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it("keeps a directory-anchored ** to that directory", () => {
    fc.assert(
      fc.property(segment, segment, path, (dir, other, rest) => {
        fc.pre(other !== dir)
        const regexp = globToRegExp(`${dir}/**`)
        expect(regexp.test(`${dir}/${rest}`)).toBe(true)
        expect(regexp.test(`${other}/${rest}`)).toBe(false)
      }),
      { numRuns: 200 },
    )
  })
})
