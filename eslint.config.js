import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"
import eslintConfigPrettier from "eslint-config-prettier/flat"

/**
 * Scoped to this package's own source (src/, test/) plus its root-level
 * build/CI scripts -- matching tsconfig.json's own include list. Examples
 * under examples/ are separate, self-contained npm projects with their own
 * tsconfig/toolchain and are intentionally not linted here; the website
 * (docs/) is static HTML/CSS/JS reviewed separately, not part of this
 * TypeScript project.
 */
export default tseslint.config(
  {
    // test/cross-runtime/**: Bun/Deno's own native test runners execute
    // these (bun:test / the global Deno namespace) -- neither is part of
    // this project's Node-targeted tsconfig, and each runtime does its own
    // type-checking when actually running the file.
    ignores: [
      "dist",
      "coverage",
      "examples",
      "docs",
      "node_modules",
      "**/node_modules",
      "test/cross-runtime",
    ],
  },
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Encodes ADR 0002 ("static analysis, never execution") as something
      // CI enforces, not just documents -- src/build/ must never gain a
      // dynamic-execution code path for discovered schema files.
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      // TypeScript's own compiler already catches genuinely undefined
      // identifiers, more accurately than this base rule (which doesn't
      // know about ambient/global type declarations) -- the official
      // typescript-eslint recommendation for TS files.
      "no-undef": "off",
      // Dedicated `import type { X } from "..."` / `export type { X }`
      // statements, never an inline `type` modifier on one specifier among
      // others (`import { value, type X }`). This package ships to consumers
      // on a wide range of TypeScript versions and non-tsc toolchains
      // (`peerDependencies.typescript` is `^5.0.0`, and `isolatedModules`
      // transpilers vary in how reliably they elide an inline per-specifier
      // `type` modifier) -- a whole-statement `import type`/`export type` is
      // erased unambiguously by every one of them. Neither rule is part of
      // `strictTypeChecked`/`stylisticTypeChecked` by default, so both are
      // opted into explicitly; `fixStyle`/`fixMixedExportsWithInlineTypeSpecifier`
      // are left at their defaults, which already produce the dedicated form.
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/consistent-type-exports": "error",
      // Interpolating a number (byte counts, day counts, variable counts --
      // this codebase's error/report messages do this constantly) can never
      // produce the "[object Object]"-style bug this rule exists to catch.
      // Booleans/objects/`any` stay disallowed.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // src/helpers/validators.ts's existing `_rawEnv` convention (a
      // Validator's second parameter, required by the type signature,
      // deliberately unused by most validators) -- standard underscore-prefix
      // opt-out, not a blanket relaxation.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // The TypeScript compiler API's own types (`ts.Node` subtypes,
    // `ts.isIdentifier`-style guards) are loose enough that defensive
    // narrowing which is actually necessary at runtime reads as
    // "unnecessary" or "non-strict-boolean" to these two rules. Scoped to
    // just the AST-walking files rather than contorting the narrowing logic
    // to satisfy a linter fighting the compiler API's actual (wider) type
    // surface -- see ADR 0002 and 0010.
    files: [
      "src/build/parse.ts",
      "src/build/scan-dependencies.ts",
      "src/build/literal-eval.ts",
      "src/build/dependency-graph.ts",
    ],
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
    },
  },
  {
    // Two idiomatic test-suite conventions, not laxity: (1) asserting a
    // fixture's own known-length array via `arr[0]!` is a standard, widely-
    // accepted test pattern -- the length is guaranteed by the same test
    // that reads it, unlike production code reading data of unknown shape;
    // (2) `it("...", async () => {...})` is vitest's idiomatic callback
    // signature regardless of whether a given test body happens to await
    // anything, since many neighboring tests in the same suite do.
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    // Every processor here exists specifically to coerce a raw `unknown`
    // value into a target type (`Processor<T> = (value: unknown) => T`, see
    // runtime/types.ts) -- `String(value)` is the deliberate, correct way to
    // do that (well-defined for every JS value, unlike a bare template
    // literal). The rule can't know these `unknown`s are never
    // plain-object-without-toString in practice (raw env values), so it
    // flags the pattern this file exists to implement.
    files: ["src/helpers/processors.ts"],
    rules: {
      "@typescript-eslint/no-base-to-string": "off",
    },
  },
  {
    // `Error.captureStackTrace?.(...)` -- `@types/node` declares this V8-only
    // API as always present, so TS considers the optional call unnecessary,
    // but it's a genuine engine difference: non-V8 JS engines (the runtime
    // half of this pair ships isomorphically, see specs/architecture.md)
    // don't have it, and calling it unguarded there would throw.
    files: ["src/runtime/errors.ts", "src/build/errors.ts"],
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },
  {
    // `typeof import("node:fs/promises")` as an inline generic type argument
    // to vitest's `importOriginal`/`vi.importActual` -- typing a dynamically
    // mocked module's real shape, not a module-level import statement with a
    // mixed value/type specifier list. `consistent-type-imports`'s
    // `disallowTypeAnnotations` (on by default) can't tell the two apart, so
    // it's scoped off just here rather than for the whole test suite.
    files: ["test/build/generate-env-artifacts.test.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { disallowTypeAnnotations: false }],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      parserOptions: { sourceType: "module" },
      globals: globals.node,
    },
  },
  {
    // Root-level config files aren't part of tsconfig.json's `include`
    // (`["src", "test"]`), so these get syntax-only TS linting -- no
    // `projectService`, hence no type-aware rules -- rather than failing to
    // resolve a TS project for them.
    files: ["*.config.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
  // Last on purpose -- turns off every core/stylistic rule that would
  // otherwise fight Prettier's own formatting decisions, so ESLint stays
  // scoped to correctness and Prettier owns formatting exclusively.
  eslintConfigPrettier,
)
