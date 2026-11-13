import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { parseJobs } from "./_ipc/ci-jobs.js"
import { renderEnvExample } from "../src/build/env-example.js"
import { generatedBanner } from "../src/build/generated-banner.js"

/**
 * Facts that can be derived must not be typed into prose, where they go stale: how many ADRs exist, the
 * version a report was produced by. And a code fence carries only a language, not editor attributes.
 */
// Mutation testing runs this file from a `.stryker-tmp/sandbox-<id>/` copy, which git ignores and whose
// sources are instrumented. Documents and sources are read from the original tree.
const sandbox = `${path.sep}.stryker-tmp${path.sep}`
const checkout = path.resolve(import.meta.dirname, "..")
const root = checkout.includes(sandbox) ? checkout.slice(0, checkout.indexOf(sandbox)) : checkout
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

/**
 * The Node versions the documentation says CI tests are the `verify` job's matrix in ci.yml, and the
 * informational one is `verify-current`'s. Both are read from the workflow, so a matrix change fails here
 * until every sentence that quotes it follows.
 */
describe("documented Node versions match the CI matrix", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8")
  const jobBlock = (id: string): string => {
    const start = workflow.indexOf(`\n  ${id}:\n`)
    if (start === -1) throw new Error(`ci.yml has no ${id} job`)
    const rest = workflow.slice(start + id.length + 5)
    const end = rest.search(/\n {2}[a-z0-9-]+:\n/)
    return end === -1 ? rest : rest.slice(0, end)
  }
  const majors = (text: string): string[] =>
    [...text.matchAll(/(\d+)\.x/g)].map((match) => match[1] ?? "")
  const tested = majors(/node-version:\s*\[([^\]]*)\]/.exec(jobBlock("verify"))?.[1] ?? "")
  const preview = majors(/node-version:\s*(\S+)/.exec(jobBlock("verify-current"))?.[1] ?? "")
  const spoken = (versions: readonly string[]): string =>
    versions.length < 2
      ? versions.join("")
      : `${versions.slice(0, -1).join(", ")} and ${versions.at(-1) ?? ""}`

  it("reads at least two tested versions and one informational version", () => {
    expect(tested.length).toBeGreaterThan(1)
    expect(preview).toHaveLength(1)
  })

  it("quotes the verify matrix in every sentence that lists the tested Node versions", () => {
    const list = /\b(?:Node(?:\.js)?|CI tests) ((?:\d+, )*\d+ and \d+)\b/g
    const lines = offending(new RegExp(list.source))
    expect(lines.length, "the guard only means something while documents quote it").toBeGreaterThan(
      4,
    )
    const wrong = lines.filter((line) =>
      [...line.matchAll(list)].some((match) => match[1] !== spoken(tested)),
    )
    expect(wrong).toEqual([])
  })

  it("names the verify-current version wherever a document says which Node version runs informationally", () => {
    const lines = offending(/\bNode(?:\.js)? \d+ runs\b/)
    expect(lines.length).toBeGreaterThan(0)
    const wrong = lines.filter((line) =>
      [...line.matchAll(/\bNode(?:\.js)? (\d+) runs\b/g)].some((match) => match[1] !== preview[0]),
    )
    expect(wrong).toEqual([])
  })
})

/**
 * Prose says which CI jobs block a merge through `required`. The `needs` list of the `required` job in
 * ci.yml is the source, so a job named in such a sentence must be in it, and no sentence may call such a
 * job non-blocking.
 */
describe("documented merge-blocking jobs match the required job in ci.yml", () => {
  const jobs = parseJobs(readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8"))
  const jobIds = new Set(jobs.map((job) => job.id))
  const waitedFor = new Set(jobs.find((job) => job.id === "required")?.needs ?? [])
  const namedJobs = (line: string): string[] =>
    [...line.matchAll(/`([a-z0-9-]+)`/g)]
      .map((match) => match[1] ?? "")
      .filter((id) => jobIds.has(id) && id !== "required")

  it("reads a required job with a non-empty needs list", () => {
    expect(waitedFor.size).toBeGreaterThan(5)
  })

  it("names only jobs in required.needs in a sentence about what `required` waits for", () => {
    const lines = offending(/`required`(?: check| job)? waits for/)
    const named = lines.flatMap(namedJobs)
    expect(
      named.length,
      "the guard only means something while documents name jobs",
    ).toBeGreaterThan(3)
    expect(lines.filter((line) => namedJobs(line).some((id) => !waitedFor.has(id)))).toEqual([])
  })

  it("names a job id in every sentence about what `required` waits for", () => {
    const waitsFor = /`required`(?: check| job)? (?:also )?waits for/
    const unnamed = offending(waitsFor).flatMap((line) =>
      line
        .split(/(?<=[.!?])\s+(?=[A-Z`*(])/)
        .filter((sentence) => waitsFor.test(sentence) && namedJobs(sentence).length === 0),
    )
    expect(unnamed).toEqual([])
  })

  it("lists in CODE_REVIEW.md exactly the jobs in required.needs, and every other job as outside it", () => {
    const review = readFileSync(path.join(root, "CODE_REVIEW.md"), "utf8").split("\n")
    const waitsLine = review.find((line) => line.includes("`required` waits for"))
    const outsideLine = review.find((line) => line.includes("outside `required`"))
    expect(new Set(namedJobs(waitsLine ?? ""))).toEqual(waitedFor)
    const outside = [...jobIds].filter((id) => id !== "required" && !waitedFor.has(id))
    expect(outside.length, "the guard only means something while a job is outside").toBeGreaterThan(
      0,
    )
    expect(new Set(namedJobs(outsideLine ?? ""))).toEqual(new Set(outside))
  })

  it("never calls a job in required.needs non-blocking", () => {
    const lines = offending(/non-blocking|not yet (?:merge-)?block/i)
    expect(lines.filter((line) => namedJobs(line).some((id) => waitedFor.has(id)))).toEqual([])
  })
})

/**
 * Documentation that names or shows the generated-file banner must show the one the generators write.
 * The marker comes from `src/build/generated-banner.ts` (backed by `src/_ipc/generated-banner.ts`),
 * and the `.env.example` header from `renderEnvExample`, so a changed banner fails here first.
 */
describe("documented generated-file banners match the generators", () => {
  const read = (file: string): string => readFileSync(path.join(root, file), "utf8")
  const regenerate = "REGENERATE"
  const marker = generatedBanner("ts", regenerate)
    .replace(/^\/\/ /, "")
    .replace(`. ${regenerate}`, "")
  const envExampleHeader = renderEnvExample([]).split("\n")[0] ?? ""

  it("derives a non-empty marker and .env.example header", () => {
    expect(marker).toMatch(/^GENERATED FILE/)
    expect(envExampleHeader).toMatch(/^# /)
  })

  it("names both real banners in AGENTS.md", () => {
    const agents = read("AGENTS.md")
    expect(agents).toContain(`\`${marker}\``)
    expect(agents).toContain(`\`${envExampleHeader}\``)
  })

  it("shows the real manifest banner in the fixture READMEs' sample output", () => {
    for (const file of [
      "test/integration/positive/enterprise/paypal-consumer/README.md",
      "test/integration/positive/enterprise/tsconfig-aliases-consumer/README.md",
    ]) {
      expect(read(file), file).toContain(generatedBanner("ts"))
    }
  })

  it("never shows a banner the generators do not write", () => {
    expect(offending(/AUTO-GENERATED FILE\.|DO NOT EDIT\b/)).toEqual([])
  })
})
