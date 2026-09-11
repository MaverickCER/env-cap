import { describe, expect, it } from "vitest"
import { displayPath } from "../../src/build/display-path.js"

describe("displayPath", () => {
  it("renders a nested path under root as root-relative, POSIX-separated", () => {
    expect(displayPath("/a/b", "/a/b/features/payments/env.schema.ts")).toBe(
      "features/payments/env.schema.ts",
    )
  })

  it("falls back to the absolute path unchanged when it escapes root via `..`", () => {
    // path.relative("/a/b/c", "/a/x") === "../../x" -- starts with ".." but
    // does NOT end with ".." (it ends with "x"), the exact shape needed to
    // distinguish `relative.startsWith("..")` from a corrupted
    // `relative.endsWith("..")`, and (since both operands of the `||` can't
    // independently vary on POSIX -- `path.relative()` never returns an
    // absolute path here) also distinguishes the whole condition from a
    // corrupted `&&` and from never firing at all: any of those three
    // mutants would wrongly return the escaping relative form
    // ("../../x") instead of the real absolute path.
    expect(displayPath("/a/b/c", "/a/x")).toBe("/a/x")
  })

  it("returns root itself as an empty string, not the absolute path", () => {
    expect(displayPath("/a/b", "/a/b")).toBe("")
  })
})
