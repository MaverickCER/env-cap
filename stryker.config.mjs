// @ts-check
/**
 * Stryker config for env-cap. Extends the shared baseline
 * (`internal-package-contract/config/stryker`) with env-cap-specific `mutate`
 * exclusions.
 *
 * Without this file, `internal-package-contract`'s `Mutation` check only ever
 * warns ("no stryker.config.* and IPC_MUTATION isn't set") instead of actually
 * running -- see specs/decisions/0039-scanner-local-dataflow-boundary.md.
 *
 * The mutation-score threshold is NOT set here -- the `Mutation` check owns that
 * number (`MUTATION_THRESHOLD` in internal-package-contract) and reads the JSON
 * report directly. env-cap's own goal is 100% of tested mutants killed; the 80%
 * figure is the fleet floor, not the target -- matching data-cap's own
 * stryker.config.mjs precedent.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: "npm",
  testRunner: "vitest",
  reporters: ["json", "clear-text", "progress"],
  // Per-test coverage: each mutant runs only the tests that cover it. Several
  // integration fixtures spawn real subprocesses (npm pack/install, the
  // packaged CLI, a full ts-json-schema-generator program), so a full-suite
  // "all" run per mutant is not viable at this test count.
  coverageAnalysis: "perTest",
  // Static mutants (evaluated once at module load) cannot be attributed to a
  // covering test under "perTest", so Stryker re-runs the entire suite for
  // each one -- the single largest contributor to wall time. Ignoring them
  // trades that for not mutating load-time-constant expressions.
  ignoreStatic: true,
  disableTypeChecks: "{src,test}/**/*.{ts,tsx}",
  // Stryker runs a trimmed vitest suite: `test/integration/**` and
  // `test/examples/**` are excluded wholesale because their "generate fresh,
  // diff against a committed golden" shape is inherently sandbox-relocation-
  // sensitive (absolute paths / fingerprint hashes baked from the real repo
  // root don't reproduce from `.stryker-tmp/sandbox-<id>/`). See
  // vitest.stryker.config.ts's own header for the full root-cause writeup.
  // Every `src/**` module those fixtures exercise has its own dedicated
  // `test/build/*.test.ts` unit coverage; a line covered ONLY by an excluded
  // test surfaces as Stryker `NoCoverage`, the right signal to add a unit
  // test, not a false pass.
  vitest: { configFile: "vitest.stryker.config.ts" },
  mutate: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    // Type-only modules: interfaces/type aliases, zero runtime behavior to
    // mutate meaningfully -- matches vitest.config.ts's own coverage.exclude
    // and each file's own module doc comment. `src/build/types.ts` is the
    // `BuildFileSystem` capability contract (ADR 0040).
    "!src/runtime/types.ts",
    "!src/build/types.ts",
  ],
  incremental: true,
  incrementalFile: "reports/mutation/stryker-incremental.json",
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  tempDirName: ".stryker-tmp",
  cleanTempDir: true,
  concurrency: 4,
  timeoutMS: 20_000,
  // Matches data-cap's own identical rationale: the initial un-mutated run
  // re-executes the whole suite once with coverage hooks, which under load
  // can exceed Stryker's 5-minute default and abort before any mutant runs.
  dryRunTimeoutMinutes: 10,
}
