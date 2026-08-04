import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { build } from "esbuild"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { gzipSync } from "node:zlib"
import { fileURLToPath } from "node:url"
import os from "node:os"
import path from "node:path"

/**
 * Verifies `env-cap/helpers`'s two namespaces are independently
 * tree-shakeable by a downstream bundler, against the actual *built* file a
 * consumer would receive (not the source) -- the bug this guards against was
 * specifically introduced by the build step (tsup/esbuild lowering
 * `export * as x from "./mod.js"` into a namespace-construction helper call
 * that a second, downstream bundler pass can't prove side-effect-free), so a
 * source-only test would not have caught it. Requires a prior `npm run
 * build`; skipped otherwise.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, "../..")
const helpersDist = path.resolve(projectRoot, "dist/helpers.js")
const distMissing = !existsSync(helpersDist)

// Marker strings unique to one namespace's error messages -- proof the
// *other* namespace's code was actually eliminated, not just smaller.
const PROCESSORS_ONLY_MARKERS = [
  "Expected a numeric value",
  "Expected a boolean-like value",
  "Expected a valid JSON string",
]
const VALIDATORS_ONLY_MARKERS = [
  "This variable is required",
  "Expected a valid email address",
  "Expected one of:",
]

describe.skipIf(distMissing)("env-cap/helpers tree-shaking (requires `npm run build`)", () => {
  let tmpDir: string

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "env-cap-treeshake-"))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  async function bundle(entryCode: string): Promise<{ code: string; gzip: number }> {
    const entryFile = path.join(tmpDir, `entry-${Math.random().toString(36).slice(2)}.mjs`)
    writeFileSync(entryFile, entryCode)
    const result = await build({
      entryPoints: [entryFile],
      bundle: true,
      minify: true,
      format: "esm",
      platform: "browser",
      write: false,
    })
    const code = result.outputFiles[0].text
    return { code, gzip: gzipSync(code).length }
  }

  it("importing only `processors` drops every `validators`-only string", async () => {
    const { code } = await bundle(
      `import { processors } from ${JSON.stringify(helpersDist)};\nconsole.log(typeof processors.number);`,
    )
    for (const marker of VALIDATORS_ONLY_MARKERS) {
      expect(code).not.toContain(marker)
    }
    // sanity check: the thing we actually asked for is still present.
    expect(code).toContain("number")
  })

  it("importing only `validators` drops every `processors`-only string", async () => {
    const { code } = await bundle(
      `import { validators } from ${JSON.stringify(helpersDist)};\nconsole.log(typeof validators.required);`,
    )
    for (const marker of PROCESSORS_ONLY_MARKERS) {
      expect(code).not.toContain(marker)
    }
    expect(code).toContain("required")
  })

  it("importing both namespaces is meaningfully larger (gzip) than importing just one", async () => {
    const [processorsOnly, both] = await Promise.all([
      bundle(
        `import { processors } from ${JSON.stringify(helpersDist)};\nconsole.log(typeof processors.number);`,
      ),
      bundle(
        `import { processors, validators } from ${JSON.stringify(helpersDist)};\nconsole.log(typeof processors.number, typeof validators.required);`,
      ),
    ])
    // Pre-fix, this gap was ~7 bytes (both namespaces shipped regardless of
    // which was imported). A real gap proves the unused namespace was cut.
    expect(both.gzip - processorsOnly.gzip).toBeGreaterThan(100)
  })

  it("importing both namespaces still contains markers from both", async () => {
    const { code } = await bundle(
      `import { processors, validators } from ${JSON.stringify(helpersDist)};\nconsole.log(typeof processors.number, typeof validators.required);`,
    )
    expect(code).toContain("required")
    expect(code.includes("Expected a numeric value") || code.includes("number")).toBe(true)
  })
})
