import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Relative-time output rots daily, and two pasted copies of it already disagreed. The README and the
 * landing page show the countdown with a placeholder instead of a number.
 */
const root = path.resolve(import.meta.dirname, "..")

describe("pasted command output", () => {
  for (const file of ["README.md", "docs/index.html"]) {
    it(`${file} shows no hard-coded relative age`, () => {
      const text = readFileSync(path.join(root, file), "utf8")
      expect(text).toContain("expired Nd ago")
      expect(text).not.toMatch(/expired \d+d ago/)
      expect(text).not.toMatch(/expires in \d+d/)
    })
  }
})
