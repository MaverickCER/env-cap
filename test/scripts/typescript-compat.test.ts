import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { peerRangeBoundaries } from "../../scripts/peer-range-versions.mjs"

// Mutation testing runs this file from a `.stryker-tmp/sandbox-<id>/` copy. Git ignores that folder, so
// `git ls-files` there lists nothing. The workflow, scripts and documents are read from the original tree.
const sandbox = `${path.sep}.stryker-tmp${path.sep}`
const checkout = path.resolve(import.meta.dirname, "../..")
const root = checkout.includes(sandbox) ? checkout.slice(0, checkout.indexOf(sandbox)) : checkout
const read = (file: string): string => readFileSync(path.join(root, file), "utf8")

const manifest = JSON.parse(read("package.json")) as {
  peerDependencies: { typescript: string }
  scripts: { "typescript-compat"?: string }
}
const [floor = ""] = peerRangeBoundaries(manifest.peerDependencies.typescript)
const [floorMajor = "", floorMinor = ""] = floor.split(".")

/** Every tracked file that states what the package supports, minus history and generated API pages. */
function statements(): string[] {
  return execFileSync(
    "git",
    ["ls-files", "*.md", "docs/*.json", "src/**/*.ts", ".github/**/*.yml", "eslint.config.js"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\n")
    .filter(
      (file) =>
        file !== "" && !/^(CHANGELOG\.md|\.changeset\/|docs\/api|specs\/decisions)/.test(file),
    )
}

/** Each release a line about TypeScript names below `lowest` in the same major, such as `5.0` or `^5.0.0`. */
function belowFloor(line: string, lowest: string): string[] {
  if (!/typescript/i.test(line)) return []
  const [major, minor] = lowest.split(".")
  return [...line.matchAll(/(?<![\w.])\^?(\d+)\.(\d+)(?:\.\d+)?(?![\w.])/g)]
    .filter((match) => match[1] === major && Number(match[2]) < Number(minor))
    .map(([text]) => text)
}

describe("the typescript-compat job tests the declared peer range", () => {
  it("derives the tested releases and their Node.js types from package.json", () => {
    const script = read("scripts/typescript-compat.mjs")
    expect(script).toMatch(/peerRangeBoundaries\(manifest\.peerDependencies\.typescript\)/)
    expect(script).toMatch(/nodeTypesFor\(spec, manifest\.engines\.node\)/)
    expect(floor).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("runs the script with no version arguments, so the derived list applies", () => {
    expect(manifest.scripts["typescript-compat"]).toBe("node scripts/typescript-compat.mjs")
    const workflow = read(".github/workflows/ci.yml")
    const start = workflow.indexOf("\n  typescript-compat:\n")
    expect(start, "ci.yml has a typescript-compat job").toBeGreaterThan(-1)
    const rest = workflow.slice(start + 1)
    const end = rest.slice(1).search(/\n {2}[a-z0-9-]+:\n/)
    const job = end === -1 ? rest : rest.slice(0, end + 1)
    expect(job).toMatch(/- run: npm run build\n/)
    expect(job).toMatch(/- run: npm run typescript-compat\n/)
  })

  it("names the floor wherever a document says which TypeScript releases CI tests", () => {
    for (const file of ["README.md", "GUIDE.md", "VERSIONING.md", "docs/surface.json"]) {
      expect(read(file), file).toContain(`${floorMajor}.${floorMinor}`)
    }
  })

  it("never names a TypeScript release below the floor of the peer range", () => {
    const files = statements()
    expect(files.length, "the guard only means something while it reads files").toBeGreaterThan(20)
    const stale = files.flatMap((file) =>
      read(file)
        .split("\n")
        .flatMap((line, index) =>
          belowFloor(line, floor).map((text) => `${file}:${String(index + 1)}: ${text}`),
        ),
    )
    expect(stale).toEqual([])
  })

  it("spots a release below the floor only on a line about TypeScript", () => {
    expect(belowFloor("TypeScript 5.0 and 5.7.3 are untested", "5.8.0")).toEqual(["5.0", "5.7.3"])
    expect(belowFloor("typescript: ^5.0.0 || ^6.0.0", "5.8.0")).toEqual(["^5.0.0"])
    expect(belowFloor("TypeScript 5.8, 5.10, 4.9, 15.0 and v5.0", "5.8.0")).toEqual([])
    expect(belowFloor("eslint 5.0", "5.8.0")).toEqual([])
  })
})
