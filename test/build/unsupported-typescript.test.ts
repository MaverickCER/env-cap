import { describe, expect, it, vi } from "vitest"
import { parseSchemaFile } from "../../src/build/parse.js"
import { scanFileForDependencies } from "../../src/build/scan-dependencies.js"

// A TypeScript whose classic compiler API is gone (what `typescript@7` looks like to this package).
vi.mock("typescript", async (importOriginal) => {
  const actual = await importOriginal<{ default: Record<string, unknown> }>()
  return { default: { ...actual.default, createSourceFile: undefined, version: "7.0.2" } }
})

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
