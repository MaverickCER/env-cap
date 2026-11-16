import path from "node:path"
import { fileURLToPath } from "node:url"
import { isInstalled, runScript, runStart } from "../support/example-runner.js"

/**
 * Shared, non-test plumbing for every `test/examples/<name>.test.ts` file.
 * Its name avoids the `*.test.ts` pattern, so Vitest never runs it directly.
 * It stays thin: the subprocess plumbing lives in
 * `test/support/example-runner.ts`, shared with the `test/integration/`
 * fixture tier. This module adds only name-based addressing and the one
 * freshness assertion the three flagship examples need.
 *
 * @remarks
 * The three flagships have no `expected/` mirror of env-cap's generated
 * output, on purpose. Their committed `docs/ENVIRONMENT.md`,
 * `docs/OWNERSHIP.md`, `docs/env.evidence.json`, `.env.example`, and
 * `src/generated/env.manifest.ts` *are* the golden. A reader opening the
 * example sees the bytes the test asserts on. A parallel `expected/` tree
 * holds every artifact twice, and a reader cannot tell which copy is
 * authoritative. A stale mirror could then sit beside correct output with no
 * test noticing. This replaces ADR 0034's three-tier split for the flagship
 * tier only.
 *
 * Freshness is asserted by running each example's `check` script:
 * `env-cap --check`, the command its README tells a reader to run in CI.
 * That verifies the committed output and exercises the drift guard itself.
 * It avoids re-implementing a byte comparison the tool already performs.
 * The `test/integration/{positive,negative}` fixtures keep their `expected/`
 * mirrors. They assert on *generator* output for cases with no human
 * reader, where a visible side-by-side diff is the point.
 *
 * Each example is its own npm project with its own node_modules, installed
 * by CI's `examples` job, not by the root `npm ci`. Every helper skips
 * rather than fails when that example's node_modules is missing. Each test
 * file gates on `isInstalled()` for that.
 */

const examplesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../examples")

/** Absolute path of one example project, by directory name. */
export function exampleDir(name: string): string {
  return path.join(examplesRoot, name)
}

/** Whether this example's own `node_modules` is present: see the module docstring. */
export function isExampleInstalled(name: string): boolean {
  return isInstalled(exampleDir(name))
}

/** Runs one of the example's own npm scripts, by name, returning combined stdout+stderr. */
export function runExampleScript(name: string, script: string): string {
  return runScript(exampleDir(name), script)
}

/** Runs the example's own `npm start` and returns combined stdout+stderr. */
export function runExampleStart(name: string): string {
  return runStart(exampleDir(name))
}

/**
 * Asserts the example's committed, generated output is exactly what a fresh
 * run would produce, by running its own `check` script (`env-cap --check`).
 * Throws with that script's full output when anything is stale or missing,
 * so a failure names the specific artifact rather than just "exit 1".
 *
 * @remarks
 * It does not regenerate first. Regenerating and then checking would assert
 * only that the generator is deterministic, which `test/build/` covers. It
 * would also silently repair the drift this is meant to catch: committed
 * output that no longer matches its source. The committed bytes must
 * already be correct.
 */
export function checkArtifactsFresh(name: string): void {
  const output = runExampleScript(name, "check")
  if (!output.includes("All generated artifacts are up to date.")) {
    throw new Error(
      `Expected "npm run check" in ${name} to report every artifact up to date.\n${output}`,
    )
  }
}
