import { describe, expect, it } from "vitest"
import { globToRegExp } from "../../src/build/glob.js"

// discover.ts's schema-discovery walk only ever exercises this module
// through `**`-heavy patterns in its own test fixtures -- a bare single `*`
// segment wildcard and `?` are never exercised anywhere else, so this file
// drives globToRegExp() directly.
describe("globToRegExp", () => {
  it("matches a `**` segment as any number of path segments, including zero", () => {
    const re = globToRegExp("**/env.schema.ts")
    expect(re.test("env.schema.ts")).toBe(true)
    expect(re.test("features/payments/env.schema.ts")).toBe(true)
  })

  it("treats a `**` not bounded by slashes on both sides as a plain any-characters wildcard", () => {
    // e.g. "foo**bar" or a trailing "**" with no following "/" -- not the
    // "any number of path segments" idiom, since that requires "**/" or a
    // leading/start-anchored "**/".
    const re = globToRegExp("foo**bar")
    expect(re.test("fooXYZbar")).toBe(true)
    expect(re.test("foo/nested/bar")).toBe(true)

    const trailing = globToRegExp("features/**")
    expect(trailing.test("features/anything")).toBe(true)
  })

  it("matches a bare `*` as any characters within one path segment only", () => {
    const re = globToRegExp("features/*/env.schema.ts")
    expect(re.test("features/payments/env.schema.ts")).toBe(true)
    expect(re.test("features/payments/nested/env.schema.ts")).toBe(false)
  })

  it("matches `?` as exactly one character within a path segment", () => {
    const re = globToRegExp("env.schema.t?")
    expect(re.test("env.schema.ts")).toBe(true)
    expect(re.test("env.schema.tsx")).toBe(false)
    expect(re.test("env.schema.t")).toBe(false)
  })

  it("escapes regex-special characters so they match literally", () => {
    const re = globToRegExp("env.schema.ts")
    expect(re.test("envXschemaXts")).toBe(false)
    expect(re.test("env.schema.ts")).toBe(true)
  })
})
