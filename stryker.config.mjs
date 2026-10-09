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
 * The mutation-score threshold is NOT set here -- the `Mutation` check owns the policy
 * (zero tolerance: every non-ignored mutant must be killed, or carry an exception record in
 * `.repo-contract/exceptions/mutation.json`) and reads the JSON report directly.
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
  disableTypeChecks: "src/**/*.ts",
  // The full suite runs under Stryker, `test/integration/**` and `test/examples/**` included. They
  // were once excluded on the belief that fixture paths and fingerprints depend on the repo's
  // absolute location; `computeSourceFingerprint()` hashes root-relative paths now, and the two
  // things that actually broke in the sandbox are fixed here instead:
  //  - `disableTypeChecks` is limited to `src/`: matching `test/` too prepended `// @ts-nocheck` to
  //    every fixture source file and shifted the line numbers the goldens pin;
  //  - `symlinkNodeModules: false`, because junction-linking a fixture's nested `node_modules` back
  //    to the real tree made `fs.realpath()`-based package resolution walk out of the sandbox.
  vitest: { configFile: "vitest.config.ts" },
  symlinkNodeModules: false,
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
  // One worker. The suite runs real subprocesses (npm pack/install, the packaged CLI, a full
  // ts-json-schema-generator program), so several workers contend for CPU: tests then time out and are
  // counted as kills, while other mutants lose their attributed runs and survive. The set of survivors
  // differed from run to run (143 non-killed at four workers, 209 at one, with only 93 in common), and a
  // full run took 60 minutes at four workers against 40 at one. A single worker is both faster and the
  // only setting whose result is the same every time.
  concurrency: 1,
  timeoutMS: 20_000,
  // Matches data-cap's own identical rationale: the initial un-mutated run
  // re-executes the whole suite once with coverage hooks, which under load
  // can exceed Stryker's 5-minute default and abort before any mutant runs.
  dryRunTimeoutMinutes: 10,
}
