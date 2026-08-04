import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { normalizeDocsForComparison } from "../../src/build/docs.js";

/**
 * Shared, non-test plumbing for every `test/examples/<name>.test.ts` file --
 * kept out of the `*.test.ts` naming so Vitest never tries to run it
 * directly. Each example is its own npm project with its own node_modules,
 * installed by CI's `examples` job (.github/workflows/ci.yml), not by the
 * root `npm ci`. Every helper below skips gracefully rather than failing
 * when that example's node_modules isn't present -- e.g. a local `npm test`
 * run that hasn't gone through the per-example install steps -- via
 * `isInstalled()`, which every per-example test file gates on.
 */

export const examplesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../examples");

export function isInstalled(exampleName: string): boolean {
  return existsSync(path.join(examplesRoot, exampleName, "node_modules"));
}

interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
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
function runNpmScript(exampleName: string, script: string): RunResult {
  const result = spawnSync("npm", ["run", "--silent", script], {
    cwd: path.join(examplesRoot, exampleName),
    encoding: "utf8",
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

/** Runs any npm script expected to succeed and returns its combined stdout+stderr. Fails the test itself if the script exits non-zero. */
export function runScript(exampleName: string, script: string): string {
  const { stdout, stderr, status } = runNpmScript(exampleName, script);
  if (status !== 0) {
    throw new Error(`Expected "npm run ${script}" in ${exampleName} to succeed, but it exited ${status}.\n${stdout}${stderr}`);
  }
  return `${stdout}${stderr}`;
}

/** Runs `npm start` and returns its combined stdout+stderr. */
export function runStart(exampleName: string): string {
  return runScript(exampleName, "start");
}

/**
 * Runs an npm script expected to exit non-zero and returns its combined
 * stdout+stderr for assertion. Fails the test itself if the command
 * unexpectedly succeeds -- these examples exist specifically to prove a
 * failure is reported correctly, so a silent "it started passing" is a
 * regression too, not a pleasant surprise.
 */
export function runExpectingFailure(exampleName: string, script: string): string {
  const { stdout, stderr, status } = runNpmScript(exampleName, script);
  if (status === 0) throw new Error(`Expected "npm run ${script}" in ${exampleName} to fail, but it exited 0.`);
  return `${stdout}${stderr}`;
}

/**
 * Byte-for-byte (Markdown artifacts: normalized via `normalizeDocsForComparison`
 * first, so the one wall-clock-relative artifact doesn't false-positive)
 * comparison of each of `relativePaths` against its `expected/<same path>`
 * golden copy -- see `examples/README.md`'s "expected/" section. Asserts
 * per-file, not as one bulk diff, so a failure names exactly which artifact
 * drifted.
 */
export async function compareGoldenArtifacts(exampleName: string, relativePaths: readonly string[]): Promise<void> {
  const exampleDir = path.join(examplesRoot, exampleName);
  for (const relativePath of relativePaths) {
    const [actual, expected] = await Promise.all([
      fs.readFile(path.join(exampleDir, relativePath), "utf8"),
      fs.readFile(path.join(exampleDir, "expected", relativePath), "utf8"),
    ]);
    const normalize = relativePath.endsWith(".md") ? normalizeDocsForComparison : (s: string): string => s;
    expect(normalize(actual), `${exampleName}/${relativePath} does not match expected/${relativePath}`).toBe(normalize(expected));
  }
}

/**
 * Normalizes a captured CLI output string for golden comparison: substitutes
 * this example's own absolute root path (which differs between machines and
 * CI runners) with a fixed placeholder, collapses the resulting run of
 * spaces `--check`'s column padding (`String.padEnd()`, sized against the
 * *original*, now-replaced path length) leaves behind, and applies the same
 * date-relative-text normalization real file comparisons use. Only
 * `cli-usage` golden-compares raw CLI output (every other example only
 * substring-asserts on runtime output) -- see its test file.
 */
export function normalizeExampleCliOutput(output: string, exampleName: string): string {
  const exampleRoot = path.join(examplesRoot, exampleName);
  const withPlaceholder = output.split(exampleRoot).join("<EXAMPLE_ROOT>");
  const collapsedPadding = withPlaceholder
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, "").replace(/ {2,}/g, " "))
    .join("\n");
  return normalizeDocsForComparison(collapsedPadding);
}

/** Same substitution `normalizeExampleCliOutput` does, applied to a raw --json payload string before `JSON.parse` -- keeps absolute paths out of the parsed comparison too. */
export function normalizeExampleJsonOutput(output: string, exampleName: string): unknown {
  const exampleRoot = path.join(examplesRoot, exampleName);
  return JSON.parse(output.split(exampleRoot).join("<EXAMPLE_ROOT>"));
}
