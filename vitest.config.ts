import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Bun/Deno's own native test runners execute these (see the
    // `cross-runtime` CI job) -- they import `bun:test`/reference the global
    // `Deno` namespace, neither of which exists under Node/vitest.
    exclude: ["test/cross-runtime/**", "**/node_modules/**"],
    watch: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Pure type-only file (interfaces/type aliases, no runtime code at all
      // -- see its own module doc comment) -- zero coverable statements, so
      // v8 reports it as a flat 0% instead of the 100%-of-nothing every
      // other metric would imply. Excluding it is the accurate reflection,
      // not a loophole: there is no line inside it a test could ever "cover."
      exclude: ["src/runtime/types.ts"],
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
