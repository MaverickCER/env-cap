import { describe, expect, it, vi } from "vitest"
import { parseSchemaFile } from "../../src/build/parse.js"
import { scanFileForDependencies } from "../../src/build/scan-dependencies.js"

// A resolved compiler with no classic API: `typescript@7` with the bundled TypeScript 6 fallback
// stripped from the install (the loader, `src/build/typescript.ts`, otherwise never returns one).
vi.mock("../../src/build/typescript.js", () => ({ ts: { version: "7.0.2" } }))

describe("an unsupported TypeScript", () => {
  it("makes the parser explain itself instead of failing with a raw TypeError", () => {
    expect(() => parseSchemaFile("a.ts", "export const x = 1")).toThrow(
      /classic compiler API.*typescript 7\.0\.2/s,
    )
  })

  it("makes the dependency scanner explain itself too", () => {
    expect(() => scanFileForDependencies("a.ts", "export const x = 1")).toThrow(
      /classic compiler API/,
    )
  })
})
