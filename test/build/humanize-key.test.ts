import { describe, it, expect } from "vitest"
import { humanizeKey } from "../../src/build/humanize-key.js"

describe("humanizeKey", () => {
  it("splits camelCase and capitalizes the first letter", () => {
    expect(humanizeKey("lastRotation")).toBe("Last Rotation")
    expect(humanizeKey("documentation")).toBe("Documentation")
    expect(humanizeKey("rotation")).toBe("Rotation")
  })

  it("handles an already-capitalized or single-word key", () => {
    expect(humanizeKey("setup")).toBe("Setup")
  })

  it("returns an empty string unchanged", () => {
    expect(humanizeKey("")).toBe("")
  })
})
