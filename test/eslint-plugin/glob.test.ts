import { describe, expect, it } from "vitest"
import { globToRegExp } from "../../src/eslint-plugin/glob.js"

// no-raw-process-env.ts's `allow` option only ever exercises this module
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

  // Exact `.source` assertions isolating each clause of the `**` detection
  // (`char === "*" && pattern[i + 1] === "*"`) and the `(?:.*/)?` vs plain
  // `.*` branch's own guard (`precededBySlashOrStart && followedBySlash`) --
  // a bare `.test()` on a hand-picked string can't distinguish every
  // sub-clause, since several inputs happen to produce the same match result
  // through a differently-shaped (but still-matching) regex.
  it.each<[string, string]>([
    // Leading "**/ " -- i === 0 (the OR's first operand) AND followed by slash.
    ["**/x", "^(?:.*\\/)?x$"],
    // Mid-path "**/ " -- NOT i === 0, but preceded by "/" (the OR's second
    // operand) AND followed by slash.
    ["a/**/b", "^a\\/(?:.*\\/)?b$"],
    // Preceded by "/" but NOT followed by slash (trailing "**") -- isolates
    // `followedBySlash` on its own: without it, this would wrongly also
    // produce the `(?:.*/)?` form.
    ["a/**", "^a\\/.*$"],
    // Followed by slash but NOT preceded by "/" or start -- isolates
    // `precededBySlashOrStart`, and proves the guard is `&&`, not `||`
    // (with `||` this would wrongly also produce the `(?:.*/)?` form).
    ["x**/y", "^x.*\\/y$"],
    // Neither preceded nor followed by a slash -- the baseline "no special
    // form at all" case, and the one that most sharply exposes the `i + 1`
    // "is the NEXT char also a `*`" detection itself being corrupted (a
    // corrupted detection drops the trailing character entirely instead of
    // emitting `.*` in the middle).
    ["a**b", "^a.*b$"],
  ])("globToRegExp(%j) produces exactly %s", (pattern, expectedSource) => {
    expect(globToRegExp(pattern).source).toBe(expectedSource)
  })
})
