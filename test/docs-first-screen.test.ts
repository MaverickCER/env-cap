import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { runInitCommand } from "../src/cli/init.js"
import type * as Runtime from "../src/runtime/index.js"

/**
 * The first screen of every surface (npm, README, landing page, agent skill) carries one pitch, and
 * the README's startup-error excerpt is real output. Both are typed by hand, so these tests pin them
 * to their sources: `package.json` `description` for the pitch, and `validateEnv()` run against the
 * contract `env-cap init` writes for the excerpt.
 */
const root = path.resolve(import.meta.dirname, "..")
const read = (file: string): string => readFileSync(path.join(root, file), "utf8")
const readJson = (file: string): unknown => JSON.parse(read(file))

/** The README's bold pitch line: the first line that is wholly `**...**`. */
function readmePitch(): string {
  const line = read("README.md")
    .split("\n")
    .find((text) => /^\*\*[^*]+\*\*$/.test(text))
  expect(line, "README.md has no bold pitch line").toBeDefined()
  return (line ?? "").slice(2, -2)
}

describe("the pitch", () => {
  const pitch = readmePitch()

  it("opens the npm description", () => {
    const { description } = readJson("package.json") as { description: string }
    expect(description.startsWith(pitch)).toBe(true)
  })

  it("opens the landing page description and is its hero heading and lede", () => {
    const site = readJson("docs/site.json") as {
      description: string
      hero: { heading: string; lede: string }
    }
    expect(site.description.startsWith(pitch)).toBe(true)
    expect(`${site.hero.heading} ${site.hero.lede}`).toBe(pitch)
  })

  it("opens the agent skill's purpose", () => {
    const skill = readJson("docs/skill.json") as { purpose: string }
    expect(skill.purpose.startsWith(pitch)).toBe(true)
  })
})

describe("the README's startup-error excerpt", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "env-cap-first-screen-"))

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("is what validateEnv() throws for the starter contract that `env-cap init` writes", async () => {
    const excerpt = /```text\n(Environment validation failed\.[\s\S]*?)\n```/.exec(
      read("README.md"),
    )?.[1]
    expect(excerpt, "README.md has no startup-error excerpt").toBeDefined()

    try {
      writeFileSync(path.join(tmp, "package.json"), '{"name": "demo"}')
      vi.spyOn(process, "cwd").mockReturnValue(tmp)
      vi.spyOn(process.stdout, "write").mockImplementation(() => true)
      expect(runInitCommand([])).toBe(0)

      // The starter imports the published name; point it at this checkout's runtime instead.
      const runtime = path.join(root, "src/runtime/index.ts")
      const schemaPath = path.join(tmp, "env.schema.ts")
      writeFileSync(
        schemaPath,
        readFileSync(schemaPath, "utf8").replace('"@maverickcer/env-cap"', JSON.stringify(runtime)),
      )
      const { exampleEnv } = (await import(schemaPath)) as { exampleEnv: unknown }
      const { validateEnv, resetEnvCache } = (await import(runtime)) as typeof Runtime

      const badValue = "http://api.example.com"
      resetEnvCache()
      const error = await validateEnv({
        manifest: [exampleEnv as never],
        values: { EXAMPLE_API_URL: badValue },
      }).then(
        () => undefined,
        (thrown: unknown) => thrown,
      )
      resetEnvCache()

      expect(error).toBeInstanceOf(Error)
      const message = (error as Error).message
      expect(message.startsWith(`${excerpt ?? ""}\n`)).toBe(true)
      expect(message).not.toContain(badValue)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
