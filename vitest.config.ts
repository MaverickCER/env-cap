import { readFileSync } from "node:fs"
import { defineConfig } from "vitest/config"

// Mirrors tsup.config.ts's `define`: tests run against `src/` directly, not
// the bundle, so `__PACKAGE_VERSION__` (a build-time constant, see ADR 0040)
// must be substituted here too.
const packageVersion: string = (
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
    version: string
  }
).version

export default defineConfig({
  define: { __PACKAGE_VERSION__: JSON.stringify(packageVersion) },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Bun/Deno's own native test runners execute these (see the
    // `cross-runtime` CI job) -- they import `bun:test`/reference the global
    // `Deno` namespace, neither of which exists under Node/vitest.
    exclude: ["test/cross-runtime/**", "**/node_modules/**"],
    watch: false,
    // Several integration fixtures spawn real subprocesses (npm install,
    // typecheck, the packaged CLI). Those routinely clear vitest's 5000ms
    // default in isolation but blow past it under full-suite parallel
    // resource contention -- raised globally rather than patched
    // file-by-file, since which fixture trips it depends on what else is
    // running concurrently. The `enterprise-platform` flagship's own
    // heaviest tests (spinning up real mongod/s3rver) still set their own
    // higher explicit per-test timeout on top of this.
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Pure type-only files (interfaces/type aliases, no runtime code at all
      // -- see each one's own module doc comment) -- zero coverable
      // statements, so v8 reports them as a flat 0% instead of the
      // 100%-of-nothing every other metric would imply. Excluding them is the
      // accurate reflection, not a loophole: there is no line inside them a
      // test could ever "cover." `src/build/types.ts` is the `BuildFileSystem`
      // capability contract (ADR 0040).
      exclude: ["src/runtime/types.ts", "src/build/types.ts"],
      reporter: ["text", "html", "lcov", "json-summary"],
      // Set a few points below the measured baseline (~99.9/99.9/100/99.9
      // lines/statements/functions/branches at the time this was raised) --
      // an enforced floor that catches a real regression without being so
      // tight that routine refactors trip it. Ratchet up only, per
      // CONTRIBUTING.md -- never lower these to accommodate a drop.
      thresholds: {
        branches: 90, // Defensive and platform-specific branches can be impractical to cover without low-value tests.
        functions: 100, // Every function should be executed by at least one test.
        lines: 95, // High confidence that nearly all executable code is exercised while allowing trivial uncovered lines.
        statements: 95, // Ensures nearly all logic is validated without encouraging coverage-only tests.
      },
    },
  },
})
