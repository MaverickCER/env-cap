import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { expect } from "vitest"
import { normalizeDocsForComparison } from "../../src/build/docs.js"
import { normalizeEvidenceSnapshotForComparison } from "../../src/build/evidence-snapshot.js"
import type { EvidenceModel } from "../../src/build/evidence-model.js"

/**
 * Shared, non-test plumbing for `test/integration/{positive,negative}/**\/*.test.ts`
 * and (via `test/examples/support.ts`) the three flagship example tests --
 * kept out of the `*.test.ts` naming so Vitest never tries to run it
 * directly. `examples/` (human-facing flagships) and `test/integration/`
 * (behavioral fixtures) are two categories of executable material sharing
 * one runner, not two forks of the same file -- every caller resolves its
 * own target directory and passes it in, rather than this module assuming
 * one fixed root.
 *
 * `compareGoldenArtifacts()` below serves the `test/integration/` fixture
 * tier only. The flagships deliberately have no `expected/` mirror; they
 * assert on their own committed output through their own `check` script --
 * see `test/examples/support.ts` for why.
 *
 * Each target is its own npm project with its own node_modules, installed by
 * CI's `examples`/`integration-fixtures` jobs (.github/workflows/ci.yml), not
 * by the root `npm ci`. Every helper below skips gracefully rather than
 * failing when that project's node_modules isn't present -- e.g. a local
 * `npm test` run that hasn't gone through the per-project install steps --
 * via `isInstalled()`, which every test file gates on.
 */

export function isInstalled(exampleDir: string): boolean {
  return existsSync(path.join(exampleDir, "node_modules"))
}

interface RunResult {
  readonly stdout: string
  readonly stderr: string
  readonly status: number | null
}

/**
 * `spawnSync`, not `execFileSync` -- deliberately. `execFileSync` only
 * returns captured output on a *throw* (a non-zero exit); on success it
 * returns stdout alone and silently discards stderr, which would drop any
 * `console.warn`-emitted content (every example script's compatibility-
 * warning output) from a successful run's return value. `spawnSync` always
 * returns both streams, regardless of exit code, so callers below can merge
 * them uniformly either way.
 *
 * `--silent` suppresses only npm's own `> script\n> command\n` preamble
 * (confirmed: the child process's real stdout/stderr, including on
 * failure, is untouched) -- required for `generate:env:json`'s output to
 * be parseable JSON at all, and incidentally keeps every other golden
 * comparison free of npm-version-dependent preamble formatting too.
 */
function runNpmScript(exampleDir: string, script: string): RunResult {
  const result = spawnSync("npm", ["run", "--silent", script], {
    cwd: exampleDir,
    encoding: "utf8",
  })
  return { stdout: result.stdout, stderr: result.stderr, status: result.status }
}

/** Runs any npm script expected to succeed and returns its combined stdout+stderr. Fails the test itself if the script exits non-zero. */
export function runScript(exampleDir: string, script: string): string {
  const { stdout, stderr, status } = runNpmScript(exampleDir, script)
  if (status !== 0) {
    throw new Error(
      `Expected "npm run ${script}" in ${exampleDir} to succeed, but it exited ${status}.\n${stdout}${stderr}`,
    )
  }
  return `${stdout}${stderr}`
}

/** Runs `npm start` and returns its combined stdout+stderr. */
export function runStart(exampleDir: string): string {
  return runScript(exampleDir, "start")
}

/**
 * Runs an npm script expected to exit non-zero and returns its combined
 * stdout+stderr for assertion. Fails the test itself if the command
 * unexpectedly succeeds -- these fixtures exist specifically to prove a
 * failure is reported correctly, so a silent "it started passing" is a
 * regression too, not a pleasant surprise.
 */
export function runExpectingFailure(exampleDir: string, script: string): string {
  const { stdout, stderr, status } = runNpmScript(exampleDir, script)
  if (status === 0)
    throw new Error(`Expected "npm run ${script}" in ${exampleDir} to fail, but it exited 0.`)
  return `${stdout}${stderr}`
}

/** Parses `text` as an `EvidenceModel` and normalizes out `provenance.generatedAt` (see `normalizeEvidenceSnapshotForComparison()`) before re-serializing -- so the persisted evidence artifact's one live timestamp never false-positives a golden comparison. A parse failure returns `text` unchanged, matching `check-artifacts.ts`'s own identically-purposed helper. */
function normalizeEvidenceJsonForComparison(text: string): string {
  try {
    const parsed = JSON.parse(text) as EvidenceModel
    return JSON.stringify(normalizeEvidenceSnapshotForComparison(parsed), null, 2)
  } catch {
    return text
  }
}

/**
 * Blanks the `now`-relative expiry countdown out of any JSON golden -- a static
 * `expiresAt` yields a different `daysRemaining` (and "expires in N day(s)"
 * message) every day, which would make a committed projection artifact rot with
 * zero real edits. The parallel of `normalizeEvidenceSnapshotForComparison`'s
 * own expiry handling, applied to the reference-projection outputs it doesn't
 * cover. The raw `expiresAt` strings stay compared.
 */
function normalizeExpiryCountdowns(text: string): string {
  return text
    .replace(/"daysRemaining":\s*-?\d+/g, '"daysRemaining": 0')
    .replace(/\b-?\d+ day\(s\)/g, "N day(s)")
}

/**
 * Byte-for-byte comparison of each of `relativePaths` against its
 * `expected/<same path>` golden copy -- see `examples/README.md`'s
 * "expected/" section. Two artifact types carry a wall-clock-relative value
 * that would otherwise false-positive: Markdown (`normalizeDocsForComparison`)
 * and the persisted evidence artifact, `docs/env.evidence.json`
 * (`normalizeEvidenceJsonForComparison`, ADR 0038) -- everything else
 * (including that artifact's own `.fingerprint` sidecar, a deterministic
 * content hash with nothing wall-clock-relative in it) compares as-is.
 * Asserts per-file, not as one bulk diff, so a failure names exactly which
 * artifact drifted.
 */
export async function compareGoldenArtifacts(
  exampleDir: string,
  relativePaths: readonly string[],
): Promise<void> {
  for (const relativePath of relativePaths) {
    const [actual, expected] = await Promise.all([
      fs.readFile(path.join(exampleDir, relativePath), "utf8"),
      fs.readFile(path.join(exampleDir, "expected", relativePath), "utf8"),
    ])
    const normalize = relativePath.endsWith(".md")
      ? normalizeDocsForComparison
      : relativePath.endsWith("env.evidence.json")
        ? normalizeEvidenceJsonForComparison
        : relativePath.endsWith(".json")
          ? normalizeExpiryCountdowns
          : (s: string): string => s
    expect(
      normalize(actual),
      `${exampleDir}/${relativePath} does not match expected/${relativePath}`,
    ).toBe(normalize(expected))
  }
}

/**
 * Normalizes a captured CLI output string for golden comparison: substitutes
 * this project's own absolute root path (which differs between machines and
 * CI runners) with a fixed placeholder, collapses the resulting run of
 * spaces `--check`'s column padding (`String.padEnd()`, sized against the
 * *original*, now-replaced path length) leaves behind, and applies the same
 * date-relative-text normalization real file comparisons use.
 */
export function normalizeExampleCliOutput(output: string, exampleDir: string): string {
  const withPlaceholder = output.split(exampleDir).join("<EXAMPLE_ROOT>")
  const collapsedPadding = withPlaceholder
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, "").replace(/ {2,}/g, " "))
    .join("\n")
  return normalizeDocsForComparison(collapsedPadding)
}

/**
 * Same substitution `normalizeExampleCliOutput` does, applied to a raw
 * --json payload string before `JSON.parse` -- keeps absolute paths out of
 * the parsed comparison too. When `--evidence` was requested alongside
 * `--json`, the envelope's own `evidence` field is a full `EvidenceModel`
 * carrying the same live `provenance.generatedAt`/`change` that
 * `compareGoldenArtifacts()` already normalizes out of the standalone
 * `docs/env.evidence.json` file (ADR 0038) -- apply the identical
 * normalization here so the embedded copy doesn't false-positive on every
 * run the same way the standalone file would have without it.
 */
export function normalizeExampleJsonOutput(output: string, exampleDir: string): unknown {
  const parsed = JSON.parse(output.split(exampleDir).join("<EXAMPLE_ROOT>")) as {
    evidence?: EvidenceModel
  }
  return parsed.evidence
    ? { ...parsed, evidence: normalizeEvidenceSnapshotForComparison(parsed.evidence) }
    : parsed
}
