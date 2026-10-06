import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Every import specifier the documentation, the agent skill, the examples and the fixtures show must be
 * the PUBLISHED name. The package is `@maverickcer/env-cap`; `env-cap` is only the binary and the brand.
 * The unscoped name fails with ERR_MODULE_NOT_FOUND for a real user, and examples that install the
 * repository under that name via a `file:` dependency hid exactly that from every test until this one.
 */
const root = path.resolve(import.meta.dirname, "..")
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((file) => !/(^|\/)(CHANGELOG\.md|package-lock\.json)$/.test(file))
  .filter((file) => !file.startsWith("docs/api") && !file.startsWith(".repo-contract/"))
  .filter((file) => /\.(md|mdx|ts|tsx|mjs|cjs|js|json|html|yml|yaml)$/.test(file))

// from "env-cap...", import("env-cap..."), require("env-cap..."), a dependency key "env-cap":, or a
// bare `env-cap/<entry point>` subpath in prose or a comment.
const WRONG = [
  /\bfrom\s+["']env-cap(?:\/[\w./-]*)?["']/,
  /\b(?:import|require)\(\s*["']env-cap(?:\/[\w./-]*)?["']\s*\)/,
  /(?<![@\w/-])env-cap\/(?:build|helpers|node|schema|evidence|eslint-plugin|runtime)\b/,
]

describe("documented import specifiers", () => {
  it("scans a meaningful number of files", () => {
    expect(tracked.length).toBeGreaterThan(200)
  })

  it("never shows the unpublished name env-cap as a module specifier", () => {
    const offenders: string[] = []
    for (const file of tracked) {
      let text: string
      try {
        text = readFileSync(path.join(root, file), "utf8")
      } catch {
        continue
      }
      text.split("\n").forEach((line, index) => {
        if (WRONG.some((pattern) => pattern.test(line)))
          offenders.push(`${file}:${String(index + 1)}: ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })

  it("never declares a fixture's dependency under the unpublished name", () => {
    const offenders = tracked
      .filter((file) => file.endsWith("package.json") && file !== "package.json")
      .filter((file) => /"env-cap"\s*:\s*"file:/.test(readFileSync(path.join(root, file), "utf8")))
    expect(offenders).toEqual([])
  })
})
