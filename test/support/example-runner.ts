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
 * and, through `test/examples/support.ts`, the three flagship example tests.
 * Its name avoids the `*.test.ts` pattern, so Vitest never runs it directly.
 * `examples/` (human-facing flagships) and `test/integration/` (behavioral
 * fixtures) share this one runner. Every caller resolves its target
 * directory and passes it in, so this module assumes no fixed root.
 *
 * `compareGoldenArtifacts()` below serves the `test/integration/` fixture
 * tier only. The flagships have no `expected/` mirror on purpose. They
 * assert on their committed output through their `check` script, and
 * `test/examples/support.ts` explains why.
 *
 * Each target is its own npm project with its own node_modules, installed by
 * CI's `examples` and `integration-fixtures` jobs (.github/workflows/ci.yml),
 * not by the root `npm ci`. Every helper below skips rather than fails when
 * that project's node_modules is missing, as in a local `npm test` without
 * the per-project installs. Each test file gates on `isInstalled()` for that.
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
 * `spawnSync`, not `execFileSync`, on purpose. `execFileSync` returns
 * captured output on a *throw* (a non-zero exit) only. On success it returns
 * stdout alone and discards stderr. That would drop `console.warn` output,
 * such as every example script's compatibility warnings, from a successful
 * run. `spawnSync` returns both streams for any exit code, so callers below
 * merge them the same way.
 *
 * `--silent` suppresses only npm's `> script\n> command\n` preamble. The
 * child process's stdout and stderr stay untouched, including on failure.
 * Without it, `generate:env:json`'s output is not parseable JSON. It also
 * keeps every other golden free of preamble text that varies by npm version.
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
 * stdout+stderr for assertion. Fails the test if the command succeeds.
 * These fixtures exist to prove a failure is reported correctly. So a
 * silent "it started passing" is a regression too.
 */
export function runExpectingFailure(exampleDir: string, script: string): string {
  const { stdout, stderr, status } = runNpmScript(exampleDir, script)
  if (status === 0)
    throw new Error(`Expected "npm run ${script}" in ${exampleDir} to fail, but it exited 0.`)
  return `${stdout}${stderr}`
}

/**
 * Parses `text` as an `EvidenceModel` and normalizes out `provenance.generatedAt` (see
 * `normalizeEvidenceSnapshotForComparison()`) before re-serializing. So the evidence file's one
 * live timestamp never fails a golden comparison. A parse failure returns `text` unchanged,
 * matching `check-artifacts.ts`'s helper for the same purpose.
 *
 * Also blanks `provenance.toolVersion`. `normalizeEvidenceSnapshotForComparison()` compares it
 * as-is on purpose. It checks a `--check` run against the `generate` run in the same process,
 * where the version cannot change (see that function's doc comment). A golden fixture spans real
 * time instead. A version bump between committing the fixture and running this test is routine,
 * and this comparison does not exist to catch it.
 */
function normalizeEvidenceJsonForComparison(text: string): string {
  try {
    const parsed = JSON.parse(text) as EvidenceModel
    const normalized = normalizeEvidenceSnapshotForComparison(parsed)
    return JSON.stringify(
      { ...normalized, provenance: { ...normalized.provenance, toolVersion: "" } },
      null,
      2,
    )
  } catch {
    return text
  }
}

/**
 * Blanks the `now`-relative expiry countdown out of any JSON golden. A static
 * `expiresAt` yields a different `daysRemaining` and "expires in N day(s)"
 * message every day. A committed projection artifact would then rot with zero
 * real edits. The parallel of `normalizeEvidenceSnapshotForComparison`'s
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
 * `expected/<same path>` golden copy (see `examples/README.md`'s "expected/"
 * section). Three artifact types carry a value that changes with a package
 * version bump between capturing the golden and running this test:
 *
 * - Markdown, normalized by `normalizeDocsForComparison`.
 * - The evidence file `docs/env.evidence.json`, normalized by
 *   `normalizeEvidenceJsonForComparison` (ADR 0038).
 * - That file's `.fingerprint` sidecar, which is skipped. `computeSourceFingerprint()`
 *   hashes in `readToolVersion()` with the file content (see its doc comment).
 *   So a golden fingerprint changes on every release, even with no content
 *   drift. The evidence JSON comparison already covers the content.
 *
 * Everything else compares as-is. Each file is asserted on its own, so a
 * failure names the artifact that drifted.
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
    const normalize = relativePath.endsWith(".fingerprint")
      ? (): string => "<FINGERPRINT>"
      : relativePath.endsWith(".md")
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
 * Normalizes a captured CLI output string for golden comparison. It replaces
 * the project's absolute root path, which differs between machines and CI
 * runners, with a fixed placeholder. `--check` pads columns with
 * `String.padEnd()` sized to the original path, so the leftover runs of
 * spaces are collapsed. Then it applies the date-relative normalization that
 * file comparisons use.
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
 * --json payload string before `JSON.parse`. It keeps absolute paths out of
 * the parsed comparison too. With `--evidence` and `--json` together, the
 * envelope's `evidence` field is a full `EvidenceModel`. It carries the live
 * `provenance.generatedAt` and `change` that `compareGoldenArtifacts()`
 * normalizes out of `docs/env.evidence.json` (ADR 0038). The same
 * normalization applies here, so the embedded copy does not fail every run.
 *
 * It also blanks the embedded evidence's `provenance.toolVersion` and the
 * envelope's top-level `toolVersion` (`JsonSuccessPayload`/`JsonErrorPayload`,
 * `src/cli/json.ts`). `normalizeEvidenceJsonForComparison()`'s doc comment
 * says why a golden must tolerate a version bump a same-process `--check`
 * never sees.
 */
export function normalizeExampleJsonOutput(output: string, exampleDir: string): unknown {
  const parsed = JSON.parse(output.split(exampleDir).join("<EXAMPLE_ROOT>")) as {
    evidence?: EvidenceModel
    toolVersion?: string
  }
  const withToolVersionBlanked =
    parsed.toolVersion !== undefined ? { ...parsed, toolVersion: "" } : parsed
  if (!withToolVersionBlanked.evidence) return withToolVersionBlanked
  const normalized = normalizeEvidenceSnapshotForComparison(withToolVersionBlanked.evidence)
  return {
    ...withToolVersionBlanked,
    evidence: { ...normalized, provenance: { ...normalized.provenance, toolVersion: "" } },
  }
}
