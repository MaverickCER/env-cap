import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Facts that can be derived must not be typed into prose, where they go stale: how many ADRs exist, the
 * version a report was produced by. And a code fence carries only a language, not editor attributes.
 */
const root = path.resolve(import.meta.dirname, "..")
const documents = execFileSync("git", ["ls-files", "*.md"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((file) => !/^(CHANGELOG\.md|docs\/api)/.test(file) && !file.includes("node_modules/"))

function offending(pattern: RegExp): string[] {
  const found: string[] = []
  for (const file of documents) {
    readFileSync(path.join(root, file), "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (pattern.test(line)) found.push(`${file}:${String(index + 1)}: ${line.trim()}`)
      })
  }
  return found
}

describe("derivable facts in documentation", () => {
  it("scans a meaningful number of documents", () => {
    expect(documents.length).toBeGreaterThan(20)
  })

  it("never types how many ADRs exist, in digits or words; the directory is the count", () => {
    const words =
      "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)"
    const spelled = `${words}(?:[- ]${words})*`
    const pattern = new RegExp(
      `\\b(\\d+|[a-z]+-plus|${spelled})\\s+(Architecture Decision Records|ADRs)\\b`,
      "i",
    )
    expect(offending(pattern)).toEqual([])
    for (const typed of [
      "twenty ADRs",
      "Twenty-three Architecture Decision Records",
      "fifty-plus ADRs",
      "48 ADRs",
    ]) {
      expect(pattern.test(typed), typed).toBe(true)
    }
    expect(pattern.test("the ADRs")).toBe(false)
  })

  it("never says the package has no dependencies key or pulls nothing in, while package.json has dependencies", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>
    }
    expect(
      Object.keys(pkg.dependencies ?? {}).length,
      "this guard only applies while there are dependencies",
    ).toBeGreaterThan(0)
    expect(offending(/no `dependencies` key|nothing is pulled transitively/i)).toEqual([])
  })

  it("never shows a literal tool version in a sample report", () => {
    expect(offending(/"toolVersion":\s*"\d/)).toEqual([])
  })

  it("opens code fences with a language only", () => {
    expect(offending(/^\s*```[^\s`]+\s+\S/)).toEqual([])
  })
})
