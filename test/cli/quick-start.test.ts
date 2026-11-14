import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * The README's quick start, run for real: the built `env-cap init` in an empty project, then the
 * `scripts/generate-env.mjs` it scaffolds. The project resolves `@maverickcer/env-cap` through a
 * `node_modules` symlink to this checkout, so the script runs against the built `dist`.
 *
 * Needs `npm run build` first. Every CI job that runs the tests builds before them, so on CI a
 * missing `dist` fails this test instead of skipping it.
 */
const projectRoot = path.resolve(import.meta.dirname, "../..")
const cliDist = path.join(projectRoot, "dist/cli/index.js")
const distMissing = !existsSync(cliDist)

describe.skipIf(distMissing && process.env["CI"] === undefined)("the README quick start", () => {
  let project: string

  beforeAll(() => {
    project = mkdtempSync(path.join(os.tmpdir(), "env-cap-quick-start-"))
    writeFileSync(path.join(project, "package.json"), '{"name": "demo", "type": "module"}')
    mkdirSync(path.join(project, "node_modules/@maverickcer"), { recursive: true })
    symlinkSync(projectRoot, path.join(project, "node_modules/@maverickcer/env-cap"), "dir")
  })

  afterAll(() => {
    rmSync(project, { recursive: true, force: true })
  })

  it("init scaffolds a contract, and the scaffolded script generates every file the README names", () => {
    expect(existsSync(cliDist), "dist/cli/index.js is missing; run `npm run build`").toBe(true)

    const init = spawnSync(process.execPath, [cliDist, "init"], { cwd: project, encoding: "utf8" })
    expect(init.stderr).toBe("")
    expect(init.status).toBe(0)

    const generate = spawnSync(process.execPath, ["scripts/generate-env.mjs"], {
      cwd: project,
      encoding: "utf8",
    })
    expect(generate.stderr).toBe("")
    expect(generate.status).toBe(0)
    expect(generate.stdout).toContain("Discovered 1 contract(s).")

    for (const file of [
      "env.schema.ts",
      "src/generated/env.manifest.ts",
      "docs/ENVIRONMENT.md",
      "docs/ENV-OWNERSHIP.md",
      ".env.example",
    ]) {
      expect(existsSync(path.join(project, file)), `${file} was not generated`).toBe(true)
    }
  }, 60_000)
})
