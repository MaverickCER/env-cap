import { defineConfig } from "tsup"

// Every entry drops comments and collapses whitespace from its built output
// (`minifyWhitespace`) -- esbuild's default, unminified behavior otherwise
// preserves every comment verbatim, which meant each exported JSDoc comment
// in src/helpers and src/runtime was shipping as dead weight inside
// dist/*.js and counting against the gzip budget below for no reader
// benefit: dts:false here means tsup emits no declarations of its own (see
// the runtime entry's comment), so none of this text ever reaches a
// consumer's editor -- IDE hover comes from the separate
// `tsc -p tsconfig.build.json` pass's own .d.ts output, not from these .js
// comments. Deliberately `minifyWhitespace`, not `minify`/`minifyIdentifiers`
// -- this drops comments/whitespace only, leaving every identifier intact,
// so a stack trace or a debugger stepping into dist/*.js still reads like
// the source. (`legalComments: "none"` alone does *not* achieve this --
// esbuild's legalComments option only ever governs `@license`/`@preserve`-
// style comments; regular JSDoc is untouched by it and is only ever
// stripped as a side effect of whitespace minification.)
const esbuildOptions = (options: { minifyWhitespace?: boolean }): void => {
  options.minifyWhitespace = true
}

export default defineConfig([
  {
    name: "runtime",
    entry: { index: "src/runtime/index.ts" },
    format: ["esm", "cjs"],
    platform: "neutral",
    target: "es2020",
    // Declarations (with declaration maps) are emitted separately by
    // `tsc -p tsconfig.build.json` -- tsup's own dts bundling pipeline
    // (rollup-plugin-dts) hardcodes declarationMap: false internally and
    // ignores dts.compilerOptions, so it can't produce them. See
    // scripts/emit-dts-shims.mjs.
    dts: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    esbuildOptions,
  },
  {
    name: "build",
    entry: { build: "src/build/index.ts" },
    format: ["esm", "cjs"],
    platform: "node",
    target: "node18",
    dts: false,
    sourcemap: true,
    treeshake: true,
    esbuildOptions,
  },
  {
    name: "helpers",
    entry: { helpers: "src/helpers/index.ts" },
    format: ["esm", "cjs"],
    platform: "neutral",
    target: "es2020",
    dts: false,
    sourcemap: true,
    treeshake: true,
    esbuildOptions,
  },
  {
    name: "cli",
    entry: { "cli/index": "src/cli/index.ts" },
    format: ["esm"],
    platform: "node",
    target: "node18",
    dts: false,
    sourcemap: true,
    banner: { js: "#!/usr/bin/env node" },
    esbuildOptions,
  },
  {
    name: "eslint-plugin",
    entry: { "eslint-plugin/index": "src/eslint-plugin/index.ts" },
    format: ["esm", "cjs"],
    // An ESLint rule runs inside ESLint's own Node process, never a browser.
    platform: "node",
    target: "node18",
    dts: false,
    sourcemap: true,
    treeshake: true,
    esbuildOptions,
    // `@typescript-eslint/utils` (bundled -- see package.json's devDependency
    // comment) internally does a dynamic `require("eslint")` for its
    // FlatESLint/ESLint wrapper types, which esbuild's ESM output can't
    // satisfy for a bundled dependency (only for a real, external runtime
    // import) -- "Dynamic require of eslint is not supported" otherwise.
    // Both are already peerDependencies a consumer has installed anyway.
    external: ["eslint", "typescript"],
    // This entry point has both a default export (the plugin object) and a
    // named export (`noRawProcessEnv`, re-exported for direct consumption --
    // see its own module doc comment). tsup's built-in `cjsInterop` option
    // only rewrites `module.exports` when a chunk has exactly one export
    // named "default" (see its source), so it silently no-ops for this
    // two-export chunk. See scripts/fix-eslint-plugin-cjs-interop.mjs for
    // the actual fix -- it has to run as a post-build pass, since tsup's own
    // named-export assignments are appended after esbuild finishes (an
    // `esbuildOptions.footer` here would land too early, before those
    // assignments exist).
  },
])
