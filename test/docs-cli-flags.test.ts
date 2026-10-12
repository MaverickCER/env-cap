import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Every long flag the CLI accepts must be documented in the GUIDE. The flags are the keys of the
 * argument tables in `src/cli/index.ts`; a flag added there without a GUIDE entry fails here, so the
 * GUIDE cannot silently fall behind the CLI.
 */
const root = path.resolve(import.meta.dirname, "..")
const cliSource = readFileSync(path.join(root, "src/cli/index.ts"), "utf8")
const guide = readFileSync(path.join(root, "GUIDE.md"), "utf8")

const flags = [...cliSource.matchAll(/^\s+"(--[a-z][a-z0-9-]*)":/gm)].flatMap(
  (match) => match[1] ?? [],
)

/** The rows of the GUIDE's "Options" table, so a flag mentioned only in passing elsewhere does not count. */
function optionRows(): string[] {
  const start = guide.indexOf("\n### Options\n")
  const rest = start === -1 ? "" : guide.slice(start + 1)
  const end = rest.slice(1).search(/\n#{1,3} /)
  const section = end === -1 ? rest : rest.slice(0, end + 1)
  return section.split("\n").filter((line) => line.startsWith("|"))
}

describe("CLI flags documented in the GUIDE", () => {
  it("finds the flags in the CLI argument tables", () => {
    expect(flags.length).toBeGreaterThan(8)
    expect(new Set(flags).size).toBe(flags.length)
  })

  it("finds the Options table in the GUIDE", () => {
    expect(optionRows().length).toBeGreaterThan(8)
  })

  it("has an Options table row for every flag, by its exact name", () => {
    const rows = optionRows()
    const missing = flags.filter(
      (flag) => !rows.some((row) => new RegExp(`(?<![\\w-])${flag}(?![\\w-])`).test(row)),
    )
    expect(missing, "flags in src/cli/index.ts with no row in GUIDE.md's Options table").toEqual([])
  })
})
