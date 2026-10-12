// @ts-check
/**
 * Stryker config for env-cap. Extends the shared baseline
 * (`internal-package-contract/config/stryker`), which sets the test runner, reporters, per-test
 * coverage, static-mutant handling and the single worker, with what is env-cap's own.
 *
 * The mutation-score threshold is NOT set here -- the `Mutation` check owns the policy
 * (zero tolerance: every non-ignored mutant must be killed, or carry an exception record in
 * `.repo-contract/exceptions/mutation.json`) and reads the JSON report directly.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
import baseline from "internal-package-contract/config/stryker"

export default {
  ...baseline,
  // Limited to `src/`: matching `test/` too would prepend `// @ts-nocheck` to every fixture source
  // file and shift the line numbers the goldens pin.
  disableTypeChecks: "src/**/*.ts",
  // The full suite runs under Stryker, `test/integration/**` and `test/examples/**` included, so
  // `symlinkNodeModules` is off: junction-linking a fixture's nested `node_modules` back to the real
  // tree made `fs.realpath()`-based package resolution walk out of the sandbox.
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
  timeoutMS: 20_000,
  // The initial un-mutated run re-executes the whole suite once with coverage hooks; under load
  // that one pass can exceed Stryker's 5-minute default and abort before any mutant runs.
  dryRunTimeoutMinutes: 10,
}
