import { describe, expect, it } from "vitest"
import { byContractIdentity } from "../../src/build/sort-by-identity.js"

describe("byContractIdentity", () => {
  it("sorts by file first", () => {
    const a = { file: "b.ts", exportName: "z" }
    const b = { file: "a.ts", exportName: "a" }
    expect(byContractIdentity(a, b)).toBeGreaterThan(0)
    expect(byContractIdentity(b, a)).toBeLessThan(0)
  })

  it("falls back to exportName when file is identical", () => {
    const a = { file: "same.ts", exportName: "z" }
    const b = { file: "same.ts", exportName: "a" }
    expect(byContractIdentity(a, b)).toBeGreaterThan(0)
    expect(byContractIdentity(b, a)).toBeLessThan(0)
  })

  it("returns exactly 0 for identical file and exportName", () => {
    const a = { file: "same.ts", exportName: "same" }
    const b = { file: "same.ts", exportName: "same" }
    expect(byContractIdentity(a, b)).toBe(0)
  })

  it("produces a stable overall order across a mixed list", () => {
    const items = [
      { file: "b.ts", exportName: "a" },
      { file: "a.ts", exportName: "z" },
      { file: "a.ts", exportName: "a" },
    ]
    expect([...items].sort(byContractIdentity)).toEqual([
      { file: "a.ts", exportName: "a" },
      { file: "a.ts", exportName: "z" },
      { file: "b.ts", exportName: "a" },
    ])
  })
})
