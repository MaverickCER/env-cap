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

/**
 * Numbers the documentation states about budgets and coverage floors must be the numbers the gates
 * read. Each budget and floor is taken from its source (`ci/size-budgets.mjs`, `vitest.config.ts`),
 * and every sentence that quotes one is pinned here, so changing a gate without the prose fails.
 */
describe("numbers in documentation match the gates", () => {
  const read = (file: string): string => readFileSync(path.join(root, file), "utf8")

  async function budgetsInKb(): Promise<Record<string, number>> {
    const module = (await import(path.join(root, "ci/size-budgets.mjs"))) as {
      default: { label: string; maxGzipBytes: number }[]
    }
    return Object.fromEntries(module.default.map((b) => [b.label, b.maxGzipBytes / 1024]))
  }

  function coverageFloors(): {
    branches: number
    functions: number
    lines: number
    statements: number
  } {
    const config = read("vitest.config.ts")
    const floor = (name: string): number => {
      const match = new RegExp(`\\b${name}:\\s*(\\d+)`).exec(config)
      if (!match?.[1]) throw new Error(`vitest.config.ts has no ${name} threshold`)
      return Number(match[1])
    }
    return {
      branches: floor("branches"),
      functions: floor("functions"),
      lines: floor("lines"),
      statements: floor("statements"),
    }
  }

  it("reads whole-kilobyte budgets for the three budgeted entries", async () => {
    const kb = await budgetsInKb()
    for (const label of ["runtime", "helpers", "evidence"]) {
      expect(Number.isInteger(kb[label]), label).toBe(true)
    }
  })

  it("quotes the gzip budgets as ci/size-budgets.mjs sets them", async () => {
    const kb = await budgetsInKb()
    const [runtime, helpers, evidence] = [kb["runtime"], kb["helpers"], kb["evidence"]].map(String)
    expect(read("README.md")).toContain(
      `${runtime} KB gzip for the runtime, ${helpers} KB for helpers and ${evidence} KB for evidence`,
    )
    const adoption = read("ADOPTION.md")
    expect(adoption).toContain(
      `The runtime entry stays under ${runtime} KB gzip, helpers under ${helpers} KB and evidence under ${evidence} KB`,
    )
    expect(adoption).toMatch(
      new RegExp(`\\|\\s*\`\\.\` \\(runtime\\)\\s*\\|\\s*${runtime} KB\\s*\\|`),
    )
    expect(adoption).toMatch(new RegExp(`\\|\\s*\`\\./helpers\`\\s*\\|\\s*${helpers} KB\\s*\\|`))
    expect(adoption).toMatch(new RegExp(`\\|\\s*\`\\./evidence\`\\s*\\|\\s*${evidence} KB\\s*\\|`))
    const guide = read("GUIDE.md")
    expect(guide).toContain(`\`./helpers\` stays under ${helpers} KB gzip`)
    expect(guide).toContain(`It stays under ${evidence} KB gzip, enforced by the \`Size\` check.`)
    expect(read("AGENTS.md")).toContain(`held to a ${runtime} KB gzip`)
    const site = JSON.parse(read("docs/site.json")) as { brief: { whyItMatters: string[] } }
    expect(site.brief.whyItMatters.join("\n")).toContain(`under ${runtime} KB compressed`)
  })

  it("quotes no gzip size that is not one of the budgets", async () => {
    const allowed = new Set(Object.values(await budgetsInKb()).map(String))
    for (const file of ["README.md", "GUIDE.md", "ADOPTION.md", "AGENTS.md", "docs/site.json"]) {
      for (const match of read(file).matchAll(/(\d+) KB (?:gzip|compressed)/g)) {
        expect(allowed.has(match[1] ?? ""), `${file}: ${match[0]}`).toBe(true)
      }
    }
  })

  it("quotes the coverage floors as vitest.config.ts sets them", () => {
    const floors = coverageFloors()
    expect(floors.lines, "the README states lines and statements as one number").toBe(
      floors.statements,
    )
    expect(read("README.md")).toContain(
      `${String(floors.branches)}% branches, ${String(floors.functions)}% functions, ${String(floors.lines)}% lines and statements`,
    )
  })

  it('says "one dependency" only while package.json has exactly one', () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> }
    const mentions = ["README.md", "GUIDE.md", "ADOPTION.md"].filter((file) =>
      /\bone dependency\b/.test(read(file)),
    )
    expect(
      mentions.length,
      "the guard only means something while a document says it",
    ).toBeGreaterThan(0)
    expect(Object.keys(pkg.dependencies ?? {}).length).toBe(1)
  })
})
