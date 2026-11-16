import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { eslintCompatPairs, peerRangeBoundaries } from "../../scripts/peer-range-versions.mjs"

// Mutation testing runs this file from a `.stryker-tmp/sandbox-<id>/` copy. The workflow and scripts are
// read from the original tree.
const sandbox = `${path.sep}.stryker-tmp${path.sep}`
const checkout = path.resolve(import.meta.dirname, "../..")
const root = checkout.includes(sandbox) ? checkout.slice(0, checkout.indexOf(sandbox)) : checkout
const read = (file: string): string => readFileSync(path.join(root, file), "utf8")

const manifest = JSON.parse(read("package.json")) as {
  peerDependencies: { eslint: string; "@typescript-eslint/utils": string }
  scripts: { "eslint-compat"?: string }
}

describe("the eslint-compat job tests the declared peer range", () => {
  it("derives the tested pairs from both peer ranges in package.json", () => {
    const script = read("scripts/eslint-compat.mjs")
    expect(script).toMatch(
      /eslintCompatPairs\(\s*manifest\.peerDependencies\.eslint,\s*manifest\.peerDependencies\["@typescript-eslint\/utils"\],?\s*\)/,
    )
  })

  it("installs the floor of the @typescript-eslint/utils range beside the ESLint floor", () => {
    const { eslint, "@typescript-eslint/utils": utils } = manifest.peerDependencies
    const [eslintFloor] = peerRangeBoundaries(eslint)
    const [utilsFloor] = peerRangeBoundaries(utils)
    expect(eslintCompatPairs(eslint, utils)).toContainEqual({
      eslint: eslintFloor,
      utils: utilsFloor,
    })
  })

  it("states in VERSIONING.md the @typescript-eslint/utils floor the job installs", () => {
    const [utilsFloor = ""] = peerRangeBoundaries(
      manifest.peerDependencies["@typescript-eslint/utils"],
    )
    const row = read("VERSIONING.md")
      .split("\n")
      .find((line) => line.includes("`scripts/eslint-compat.mjs`"))
    expect(row, "VERSIONING.md has the eslint-compat row").toBeDefined()
    expect(row).toContain(`\`@typescript-eslint/utils\`: ${utilsFloor}`)
    expect(row).not.toMatch(/not tested/)
  })

  it("names the eslint-compat job wherever a document says which ESLint versions CI tests", () => {
    for (const file of [
      "GUIDE.md",
      "ADOPTION.md",
      "VERSIONING.md",
      "docs/surface.json",
      "src/eslint-plugin/index.ts",
    ]) {
      expect(read(file), file).toContain("`eslint-compat`")
    }
  })

  it("never names an ESLint major outside the peer range", () => {
    const majors = peerRangeBoundaries(manifest.peerDependencies.eslint).filter(
      (version) => !version.includes("."),
    )
    const files = execFileSync("git", ["ls-files", "*.md", "docs/*.json", "src/**/*.ts"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter((file) => file !== "" && !/^(CHANGELOG\.md|docs\/api|specs\/decisions)/.test(file))
    expect(files.length, "the guard only means something while it reads files").toBeGreaterThan(20)
    const outside = files.flatMap((file) =>
      [...read(file).matchAll(/\bESLint v?(\d+)\b/g)]
        .filter((match) => !majors.includes(match[1] ?? ""))
        .map((match) => `${file}: ${match[0]}`),
    )
    expect(outside).toEqual([])
    expect(/\bESLint v?(\d+)\b/.exec("ESLint 7")?.[1]).toBe("7")
  })

  it("runs the script with no version arguments, so the derived list applies", () => {
    expect(manifest.scripts["eslint-compat"]).toBe("node scripts/eslint-compat.mjs")
    const workflow = read(".github/workflows/ci.yml")
    const start = workflow.indexOf("\n  eslint-compat:\n")
    expect(start, "ci.yml has an eslint-compat job").toBeGreaterThan(-1)
    const rest = workflow.slice(start + 1)
    const end = rest.slice(1).search(/\n {2}[a-z0-9-]+:\n/)
    const job = end === -1 ? rest : rest.slice(0, end + 1)
    expect(job).toMatch(/- run: npm run build\n/)
    expect(job).toMatch(/- run: npm run eslint-compat\n/)
  })
})
