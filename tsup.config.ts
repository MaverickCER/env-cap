import { readFileSync } from "node:fs"
import { defineConfig, type Options } from "tsup"

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

const bundles: Options[] = [
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
    // NOT `clean: true` here -- tsup runs the whole bundle array concurrently, and cleaning from
    // inside one bundle races with the others writing into the same `dist/` (an intermittent
    // `ENOENT: unlink dist/index.js.map` whenever a dependent project's install re-ran the build).
    // `dist/` is cleaned once, deterministically, by `npm run clean` as the first step of `build`.
    treeshake: true,
  },
  {
    name: "build",
    entry: { build: "src/build/index.ts" },
    format: ["esm", "cjs"],
    platform: "node",
    target: "node22",
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
    target: "node22",
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
    target: "node22",
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
    target: "node22",
    dts: false,
    sourcemap: true,
    treeshake: true,
    // `@typescript-eslint/utils` is an optional peer, NOT bundled (ADR 0048): a bundled copy is
    // invisible to a consumer's `npm audit`/Dependabot/Socket and frozen at build time. Anyone
    // linting TypeScript with ESLint already has it through `typescript-eslint`.
    external: ["eslint", "typescript", "@typescript-eslint/utils"],
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
]

// Maps keep pointing at `src/` lines but no longer embed the full source text of every file (and of
// the vendored third-party code in the ESLint plugin bundle): that text was about 60% of the
// unpacked package, and the sources are in the repository.
export default defineConfig(
  bundles.map((bundle) => ({
    ...bundle,
    esbuildOptions(options, context) {
      options.sourcesContent = false
      bundle.esbuildOptions?.(options, context)
    },
  })),
)
