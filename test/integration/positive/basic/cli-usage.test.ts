import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  compareGoldenArtifacts,
  isInstalled,
  normalizeExampleCliOutput,
  normalizeExampleJsonOutput,
  runScript,
} from "../../../support/example-runner.js"

/**
 * cli-usage verifies the packaged `env-cap` binary itself, not just the
 * library functions `test/cli/*.test.ts` already cover in-process --
 * basic-node's exact contract, but every `package.json` script here
 * invokes `node_modules/.bin/env-cap` directly instead of calling
 * `generateEnvArtifacts()` from a custom `.mjs` script. This file verifies:
 *  - the real CLI's three modes (normal write, `--check`, `--json`) each
 *    produce output byte-for-byte matching their `expected/cli/*` golden
 *    copies (after normalizing this example's own absolute path and
 *    `--check`'s path-length-dependent column padding -- see
 *    `normalizeExampleCliOutput`), proving the packaged `bin` entry
 *    resolves and behaves exactly as documented
 *  - the artifacts it writes are byte-for-byte identical to what every
 *    other example's library-direct `.mjs` script produces for the same
 *    shape of contract
 */
const EXAMPLE = "cli-usage"
const EXAMPLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), EXAMPLE)
const ARTIFACTS = [
  "src/generated/env.manifest.ts",
  "docs/env.evidence.json",
  "docs/env.evidence.json.fingerprint",
  "docs/ENVIRONMENT.md",
  "docs/OWNERSHIP.md",
  ".env.example",
]
const installed = isInstalled(EXAMPLE_DIR)

async function readGolden(relativePath: string): Promise<string> {
  return fs.readFile(path.join(EXAMPLE_DIR, "expected", relativePath), "utf8")
}

describe(EXAMPLE, () => {
  it.skipIf(!installed)(
    "generate:env (normal write mode) matches its golden stdout, and every written artifact matches its golden expected/ copy",
    async () => {
      const output = normalizeExampleCliOutput(runScript(EXAMPLE_DIR, "generate:env"), EXAMPLE_DIR)
      const golden = await readGolden("cli/generate-stdout.txt")
      expect(output).toBe(golden)

      await compareGoldenArtifacts(EXAMPLE_DIR, ARTIFACTS)
    },
  )

  it.skipIf(!installed)(
    "verify:env (--check), run after generate:env above has already produced matching artifacts, reports up to date",
    async () => {
      const output = normalizeExampleCliOutput(runScript(EXAMPLE_DIR, "verify:env"), EXAMPLE_DIR)
      const golden = await readGolden("cli/check-stdout.txt")
      expect(output).toBe(golden)
      expect(output).toContain("All generated artifacts are up to date.")
    },
  )

  it.skipIf(!installed)(
    "generate:env:json emits a --json envelope matching its golden report.json, compared as parsed JSON so key ordering can't cause spurious failures",
    async () => {
      // Path-substitution only here, not normalizeExampleCliOutput's
      // whitespace-collapsing -- JSON has no --check-style column padding to
      // worry about, and blindly collapsing runs of spaces could corrupt a
      // real string value that happens to contain one.
      const actual = normalizeExampleJsonOutput(
        runScript(EXAMPLE_DIR, "generate:env:json"),
        EXAMPLE_DIR,
      )
      const expected = normalizeExampleJsonOutput(await readGolden("cli/report.json"), EXAMPLE_DIR)
      expect(actual).toEqual(expected)
    },
  )
})
