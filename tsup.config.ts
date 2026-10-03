import { readFileSync } from "node:fs"
import { defineConfig } from "tsup"

// Read once, here, at build time -- NOT shipped in dist/. Substituted into
// `src/build/tool-version.ts` and `src/cli/json.ts` via `define` below, so
// neither reads `package.json` from disk at runtime. See ADR 0040.
const packageVersion: string = (
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
    version: string
  }
).version
const versionDefine = { __PACKAGE_VERSION__: JSON.stringify(packageVersion) }

// Nothing here may minify: no `minify*` option, no esbuildOptions that sets one. Minified code is a
// Socket.dev supply-chain alert and internal-package-contract's NoMinify check fails the contract
// on it. The built output ships exactly as esbuild prints it, comments included.

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
    define: versionDefine,
  },
  {
    name: "node",
    // The `@maverickcer/env-cap/node` entry -- the Node-backed
    // `BuildFileSystem` adapter (`src/cli/filesystem.ts`, re-exported through
    // `src/node/index.ts`). An executable-context entry like `bin` /
    // `./eslint-plugin`: it legitimately bundles `node:fs/promises`, and
    // `scripts/verify-no-ambient-fs.mjs` exempts its resolved target. See ADR 0040.
    entry: { node: "src/node/index.ts" },
    format: ["esm", "cjs"],
    platform: "node",
    target: "node18",
    dts: false,
    sourcemap: true,
    treeshake: true,
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
    define: versionDefine,
  },
  {
    name: "evidence",
    entry: { evidence: "src/evidence/index.ts" },
    format: ["esm", "cjs"],
    // Isomorphic, like runtime/helpers -- no node:fs, no `typescript`, safe
    // in a browser/edge bundle. `EvidenceModel` is imported as a type only
    // (erased at compile time), so this platform/target pair matches
    // runtime/helpers, not build.
    platform: "neutral",
    target: "es2020",
    dts: false,
    sourcemap: true,
    treeshake: true,
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
