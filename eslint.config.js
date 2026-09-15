import baseline from "internal-package-contract/eslint"
import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier/flat"
import globals from "globals"
import tseslint from "typescript-eslint"

/**
 * Scoped to this package's own source (src/, test/) plus its root-level
 * build/CI scripts -- matching tsconfig.json's own include/exclude list.
 * The three flagship examples under examples/, the benchmark projects
 * under benchmark/, and every relocated behavioral fixture under
 * test/integration/{positive,negative}/, are separate, self-contained npm
 * projects with their own tsconfig/toolchain and are intentionally not
 * linted here; the website (docs/) is static HTML/CSS/JS reviewed
 * separately, not part of this TypeScript project.
 *
 * Extends internal-package-contract's org-wide baseline (`js.configs.
 * recommended` + untyped `tseslint.configs.recommended` + Node globals,
 * deliberately non-type-checked -- see that package's own eslint.config.mjs
 * for why) rather than duplicating it. `baseline` is spread first; every
 * block below layers stricter, package-specific rules on top for the files
 * it targets -- flat config applies later same-file blocks after earlier
 * ones, so this package's own `strictTypeChecked`/`stylisticTypeChecked`
 * tier and `eslintConfigPrettier` (last, so Prettier still wins) both still
 * take effect exactly as before.
 */
export default tseslint.config(
  ...baseline,
  // Baseline's own `tseslint.configs.recommended` matches every `**/*.ts` file
  // with no `tsconfigRootDir` of its own (deliberately -- it's meant to work
  // unmodified in any consuming project). Once this package's own node_modules
  // contains another package (internal-package-contract) that also ships a
  // tsconfig.json, typescript-eslint's auto-detection for root-level `.ts`
  // config files this repo's own blocks don't otherwise scope (tsup.config.ts,
  // vitest.config.ts, vitest.stryker.config.ts) becomes genuinely ambiguous
  // between the two candidate roots -- confirmed directly: removing this
  // block reproduces the exact "multiple candidate TSConfigRootDirs" parsing
  // error on exactly those files. Setting it explicitly, globally, removes
  // the ambiguity without touching baseline's own file matching.
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // test/cross-runtime/**: Bun/Deno's own native test runners execute
    // these (bun:test / the global Deno namespace) -- neither is part of
    // this project's Node-targeted tsconfig, and each runtime does its own
    // type-checking when actually running the file.
    ignores: [
      "dist",
      "coverage",
      // Stryker's per-mutant sandbox copies of the whole repo -- ephemeral
      // (created and torn down mid-run) and, being a copy, would just
      // duplicate whatever findings already apply to the real tree.
      ".stryker-tmp",
      "examples",
      "benchmark",
      "docs",
      "node_modules",
      "**/node_modules",
      "test/cross-runtime",
      // Relocated behavioral fixtures (Part 0 of the examples restructuring,
      // ADR 0034) -- each is its own self-contained npm project with its own
      // tsconfig/toolchain, same as everything under examples/ above, just
      // now nested under test/ instead of being a top-level sibling of it.
      "test/integration/positive/basic/cli-usage",
      "test/integration/positive/basic/split-generators",
      "test/integration/positive/team/validation-contexts",
      "test/integration/positive/team/duplicate-variable-metadata",
      "test/integration/positive/enterprise/aws-secrets-manager",
      "test/integration/positive/enterprise/paypal-addon",
      "test/integration/positive/enterprise/paypal-consumer",
      "test/integration/positive/enterprise/tsconfig-aliases",
      "test/integration/positive/enterprise/tsconfig-aliases-consumer",
      "test/integration/positive/enterprise/evidence-projections",
      "test/integration/negative/invalid-config/missing-env-var",
      "test/integration/negative/exclusive-violation/multiple-active-exclusive-capabilities",
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
    // ADR 0040: every library surface (`.`, `./helpers`, `./build`, ...) must
    // not acquire a filesystem capability implicitly -- `./build` accepts a
    // `BuildFileSystem` from its caller instead. Only `src/cli/**` (the
    // executable capability boundary that constructs the `node:fs/promises`
    // adapter) may import `node:fs`. The published `env-cap/
    // eslint-plugin` ships `no-node-fs` for a consumer to enforce the same
    // discipline; this `no-restricted-imports` block is env-cap's own, needing
    // no plugin build. `scripts/verify-no-ambient-fs.mjs` is the
    // release-blocking backstop that checks the actual tarball.
    files: ["src/**/*.ts"],
    ignores: ["src/cli/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["fs", "node:fs", "fs/promises", "node:fs/promises"].map((name) => ({
            name,
            message:
              "ADR 0040: a library surface must not import node:fs. Accept a BuildFileSystem capability from the caller (see src/build/types.ts). Only src/cli/** may import node:fs.",
          })),
        },
      ],
    },
  },
  {
    // Same discipline as the node:fs ban above, for node:child_process --
    // but with no src/cli/** exemption: unlike node:fs (which the CLI
    // legitimately needs to construct the fs adapter it hands to ./build),
    // env-cap has no legitimate reason to spawn a process anywhere,
    // including its own CLI. This mechanically enforces "the consumer
    // provides shell access, this package never defaults to it" as a
    // standing guarantee rather than resting on today's absence of usage.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["child_process", "node:child_process"].map((name) => ({
            name,
            message:
              "env-cap never spawns a process itself -- there is no capability-injection escape hatch for this one, unlike node:fs. If a real need appears, it belongs in dev/build tooling (scripts/), never in src/.",
          })),
        },
      ],
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
    files: [
      "test/build/generate-env-artifacts.test.ts",
      "test/build/tool-version.test.ts",
      "test/build/resolution/resolve-import.test.ts",
    ],
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
